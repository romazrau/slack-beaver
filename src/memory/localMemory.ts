import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type AllowedFolder = {
  path: string;
  label: string | null;
  enabled: boolean;
  createdAt: string;
  lastVerifiedAt: string;
};

export type ProviderConfig = {
  provider: string;
  tokenConfigured: boolean;
  updatedAt: string;
};

export type ToolCallAudit = {
  source: string;
  toolName: string;
  inputSummary: string;
  outputSummary?: string;
  status: "success" | "error" | "rejected";
  errorSummary?: string;
};

export type LocalMemoryResetResult = {
  allowedFolders: number;
  settings: number;
  conversations: number;
  toolCalls: number;
  providerConfig: number;
};

export class LocalMemoryStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  listAllowedFolders(): AllowedFolder[] {
    const rows = this.db
      .prepare(
        `select path, label, enabled, created_at as createdAt, last_verified_at as lastVerifiedAt
         from allowed_folders
         order by path asc`
      )
      .all() as Array<Omit<AllowedFolder, "enabled"> & { enabled: number }>;

    return rows.map((row) => ({
      ...row,
      enabled: row.enabled === 1
    }));
  }

  listEnabledAllowedFolderPaths(): string[] {
    return this.listAllowedFolders()
      .filter((folder) => folder.enabled)
      .map((folder) => folder.path);
  }

  upsertAllowedFolder(folderPath: string, label?: string): AllowedFolder {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `insert into allowed_folders (path, label, enabled, created_at, last_verified_at)
         values (@path, @label, 1, @now, @now)
         on conflict(path) do update set
           label = excluded.label,
           enabled = 1,
           last_verified_at = excluded.last_verified_at`
      )
      .run({
        path: folderPath,
        label: label ?? null,
        now
      });

    return this.getAllowedFolder(folderPath);
  }

  disableAllowedFolder(folderPath: string): boolean {
    const result = this.db
      .prepare("update allowed_folders set enabled = 0 where path = ? and enabled = 1")
      .run(folderPath);
    return result.changes > 0;
  }

  setProviderTokenConfigured(provider: string, tokenConfigured: boolean): ProviderConfig {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `insert into provider_config (provider, token_configured, updated_at)
         values (?, ?, ?)
         on conflict(provider) do update set
           token_configured = excluded.token_configured,
           updated_at = excluded.updated_at`
      )
      .run(provider, tokenConfigured ? 1 : 0, now);

    return {
      provider,
      tokenConfigured,
      updatedAt: now
    };
  }

  getProviderConfig(provider: string): ProviderConfig | undefined {
    const row = this.db
      .prepare(
        `select provider, token_configured as tokenConfigured, updated_at as updatedAt
         from provider_config
         where provider = ?`
      )
      .get(provider) as
      | { provider: string; tokenConfigured: number; updatedAt: string }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      provider: row.provider,
      tokenConfigured: row.tokenConfigured === 1,
      updatedAt: row.updatedAt
    };
  }

  recordToolCall(entry: ToolCallAudit): void {
    this.db
      .prepare(
        `insert into tool_calls
          (source, tool_name, input_summary, output_summary, status, error_summary, created_at)
         values
          (@source, @toolName, @inputSummary, @outputSummary, @status, @errorSummary, @createdAt)`
      )
      .run({
        ...entry,
        outputSummary: entry.outputSummary ?? null,
        errorSummary: entry.errorSummary ?? null,
        createdAt: new Date().toISOString()
      });
  }

  resetAll(): LocalMemoryResetResult {
    const counts = {
      allowedFolders: this.countRows("allowed_folders"),
      settings: this.countRows("settings"),
      conversations: this.countRows("conversations"),
      toolCalls: this.countRows("tool_calls"),
      providerConfig: this.countRows("provider_config")
    };

    const reset = this.db.transaction(() => {
      this.db.prepare("delete from allowed_folders").run();
      this.db.prepare("delete from settings").run();
      this.db.prepare("delete from conversations").run();
      this.db.prepare("delete from tool_calls").run();
      this.db.prepare("delete from provider_config").run();
      this.db.prepare("delete from sqlite_sequence where name in ('conversations', 'tool_calls')").run();
    });
    reset();

    return counts;
  }

  private getAllowedFolder(folderPath: string): AllowedFolder {
    const row = this.db
      .prepare(
        `select path, label, enabled, created_at as createdAt, last_verified_at as lastVerifiedAt
         from allowed_folders
         where path = ?`
      )
      .get(folderPath) as (Omit<AllowedFolder, "enabled"> & { enabled: number }) | undefined;

    if (!row) {
      throw new Error(`Allowed folder was not saved: ${folderPath}`);
    }

    return {
      ...row,
      enabled: row.enabled === 1
    };
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists allowed_folders (
        path text primary key,
        label text,
        enabled integer not null default 1,
        created_at text not null,
        last_verified_at text not null
      );

      create table if not exists settings (
        key text primary key,
        value text not null,
        updated_at text not null
      );

      create table if not exists conversations (
        id integer primary key autoincrement,
        slack_user_id text not null,
        channel_id text not null,
        thread_ts text,
        state_summary text,
        updated_at text not null
      );

      create table if not exists tool_calls (
        id integer primary key autoincrement,
        source text not null,
        tool_name text not null,
        input_summary text not null,
        output_summary text,
        status text not null,
        error_summary text,
        created_at text not null
      );

      create table if not exists provider_config (
        provider text primary key,
        token_configured integer not null default 0,
        updated_at text not null
      );
    `);
  }

  private countRows(tableName: string): number {
    const row = this.db.prepare(`select count(*) as count from ${tableName}`).get() as {
      count: number;
    };
    return row.count;
  }
}

export function mergeUniquePaths(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right].map((item) => path.resolve(item)))).sort((a, b) =>
    a.localeCompare(b)
  );
}

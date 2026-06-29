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

export type Setting = {
  key: string;
  value: string;
  updatedAt: string;
};

export type LocalRuntimeStatus = {
  processName: string;
  lastSeenAt: string;
};

export type RecentConversation = {
  slackUserId: string;
  channelId: string;
  threadTs: string | null;
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

export type ConversationTurnKind = "full" | "summary";

export type ConversationTurn = {
  id: number;
  slackUserId: string;
  channelId: string;
  threadTs: string | null;
  kind: ConversationTurnKind;
  userText: string | null;
  assistantReply: string;
  source: string;
  toolCallSummary: string | null;
  createdAt: string;
};

export type ConversationTurnInput = {
  slackUserId: string;
  channelId: string;
  threadTs?: string;
  userText: string;
  assistantReply: string;
  source: string;
  toolCallSummary?: string;
};

export type ConversationSummaryInput = {
  slackUserId: string;
  channelId: string;
  threadTs?: string;
  summary: string;
  source: string;
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

  setSetting(key: string, value: string): Setting {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `insert into settings (key, value, updated_at)
         values (?, ?, ?)
         on conflict(key) do update set
           value = excluded.value,
           updated_at = excluded.updated_at`
      )
      .run(key, value, now);

    return {
      key,
      value,
      updatedAt: now
    };
  }

  getSetting(key: string): Setting | undefined {
    return this.db
      .prepare(
        `select key, value, updated_at as updatedAt
         from settings
         where key = ?`
      )
      .get(key) as Setting | undefined;
  }

  deleteSetting(key: string): boolean {
    const result = this.db.prepare("delete from settings where key = ?").run(key);
    return result.changes > 0;
  }

  recordRuntimeHeartbeat(processName: string, seenAt = new Date()): LocalRuntimeStatus {
    const normalizedProcessName = requireNonEmptyString(processName, "processName");
    const lastSeenAt = seenAt.toISOString();
    this.db
      .prepare(
        `insert into runtime_heartbeats (process_name, last_seen_at)
         values (?, ?)
         on conflict(process_name) do update set
           last_seen_at = excluded.last_seen_at`
      )
      .run(normalizedProcessName, lastSeenAt);

    return {
      processName: normalizedProcessName,
      lastSeenAt
    };
  }

  getRuntimeStatus(processName: string): LocalRuntimeStatus | undefined {
    const normalizedProcessName = requireNonEmptyString(processName, "processName");
    const row = this.db
      .prepare(
        `select process_name as processName, last_seen_at as lastSeenAt
         from runtime_heartbeats
         where process_name = ?`
      )
      .get(normalizedProcessName) as LocalRuntimeStatus | undefined;

    return row;
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
      this.db.prepare("delete from conversation_turns").run();
      this.db.prepare("delete from tool_calls").run();
      this.db.prepare("delete from provider_config").run();
      this.db.prepare("delete from runtime_heartbeats").run();
      this.db
        .prepare("delete from sqlite_sequence where name in ('conversations', 'conversation_turns', 'tool_calls')")
        .run();
    });
    reset();

    return counts;
  }

  appendConversationTurn(input: ConversationTurnInput): ConversationTurn {
    const now = new Date().toISOString();
    this.ensureConversation(input.slackUserId, input.channelId, input.threadTs ?? null, now);
    const result = this.db
      .prepare(
        `insert into conversation_turns
          (slack_user_id, channel_id, thread_ts, kind, user_text, assistant_reply, source, tool_call_summary, created_at)
         values
          (@slackUserId, @channelId, @threadTs, 'full', @userText, @assistantReply, @source, @toolCallSummary, @createdAt)`
      )
      .run({
        slackUserId: input.slackUserId,
        channelId: input.channelId,
        threadTs: input.threadTs ?? null,
        userText: input.userText,
        assistantReply: input.assistantReply,
        source: input.source,
        toolCallSummary: input.toolCallSummary ?? null,
        createdAt: now
      });
    return this.getConversationTurn(Number(result.lastInsertRowid));
  }

  upsertConversationSummary(input: ConversationSummaryInput): ConversationTurn {
    const now = new Date().toISOString();
    this.ensureConversation(input.slackUserId, input.channelId, input.threadTs ?? null, now, input.summary);
    this.db
      .prepare(
        `delete from conversation_turns
         where slack_user_id = @slackUserId
           and channel_id = @channelId
           and coalesce(thread_ts, '') = coalesce(@threadTs, '')
           and kind = 'summary'`
      )
      .run({
        slackUserId: input.slackUserId,
        channelId: input.channelId,
        threadTs: input.threadTs ?? null
      });
    const result = this.db
      .prepare(
        `insert into conversation_turns
          (slack_user_id, channel_id, thread_ts, kind, user_text, assistant_reply, source, tool_call_summary, created_at)
         values
          (@slackUserId, @channelId, @threadTs, 'summary', null, @assistantReply, @source, null, @createdAt)`
      )
      .run({
        slackUserId: input.slackUserId,
        channelId: input.channelId,
        threadTs: input.threadTs ?? null,
        assistantReply: input.summary,
        source: input.source,
        createdAt: now
      });
    return this.getConversationTurn(Number(result.lastInsertRowid));
  }

  listConversationTurns(slackUserId: string, channelId: string, threadTs?: string): ConversationTurn[] {
    const rows = this.db
      .prepare(
        `select id,
                slack_user_id as slackUserId,
                channel_id as channelId,
                thread_ts as threadTs,
                kind,
                user_text as userText,
                assistant_reply as assistantReply,
                source,
                tool_call_summary as toolCallSummary,
                created_at as createdAt
         from conversation_turns
         where slack_user_id = @slackUserId
           and channel_id = @channelId
           and coalesce(thread_ts, '') = coalesce(@threadTs, '')
         order by id asc`
      )
      .all({
        slackUserId,
        channelId,
        threadTs: threadTs ?? null
      }) as ConversationTurn[];

    return rows;
  }

  getMostRecentConversation(): RecentConversation | undefined {
    const row = this.db
      .prepare(
        `select slack_user_id as slackUserId,
                channel_id as channelId,
                thread_ts as threadTs,
                updated_at as updatedAt
         from conversations
         order by (
           select max(id)
           from conversation_turns
           where conversation_turns.slack_user_id = conversations.slack_user_id
             and conversation_turns.channel_id = conversations.channel_id
             and coalesce(conversation_turns.thread_ts, '') = coalesce(conversations.thread_ts, '')
         ) desc,
         updated_at desc,
         id desc
         limit 1`
      )
      .get() as RecentConversation | undefined;

    return row;
  }

  deleteConversationTurns(ids: number[]): void {
    if (ids.length === 0) {
      return;
    }

    const remove = this.db.transaction((turnIds: number[]) => {
      const statement = this.db.prepare("delete from conversation_turns where id = ?");
      for (const id of turnIds) {
        statement.run(id);
      }
    });
    remove(ids);
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

      create table if not exists conversation_turns (
        id integer primary key autoincrement,
        slack_user_id text not null,
        channel_id text not null,
        thread_ts text,
        kind text not null,
        user_text text,
        assistant_reply text not null,
        source text not null,
        tool_call_summary text,
        created_at text not null
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

      create table if not exists runtime_heartbeats (
        process_name text primary key,
        last_seen_at text not null
      );
    `);
  }

  private ensureConversation(
    slackUserId: string,
    channelId: string,
    threadTs: string | null,
    updatedAt: string,
    stateSummary?: string
  ): void {
    const existing = this.db
      .prepare(
        `select id
         from conversations
         where slack_user_id = @slackUserId
           and channel_id = @channelId
           and coalesce(thread_ts, '') = coalesce(@threadTs, '')`
      )
      .get({ slackUserId, channelId, threadTs }) as { id: number } | undefined;

    if (existing) {
      this.db
        .prepare(
          `update conversations
           set state_summary = coalesce(@stateSummary, state_summary),
               updated_at = @updatedAt
           where id = @id`
        )
        .run({
          id: existing.id,
          stateSummary: stateSummary ?? null,
          updatedAt
        });
      return;
    }

    this.db
      .prepare(
        `insert into conversations (slack_user_id, channel_id, thread_ts, state_summary, updated_at)
         values (@slackUserId, @channelId, @threadTs, @stateSummary, @updatedAt)`
      )
      .run({
        slackUserId,
        channelId,
        threadTs,
        stateSummary: stateSummary ?? null,
        updatedAt
      });
  }

  private getConversationTurn(id: number): ConversationTurn {
    const row = this.db
      .prepare(
        `select id,
                slack_user_id as slackUserId,
                channel_id as channelId,
                thread_ts as threadTs,
                kind,
                user_text as userText,
                assistant_reply as assistantReply,
                source,
                tool_call_summary as toolCallSummary,
                created_at as createdAt
         from conversation_turns
         where id = ?`
      )
      .get(id) as ConversationTurn | undefined;

    if (!row) {
      throw new Error(`Conversation turn was not saved: ${id}`);
    }

    return row;
  }

  private countRows(tableName: string): number {
    const row = this.db.prepare(`select count(*) as count from ${tableName}`).get() as {
      count: number;
    };
    return row.count;
  }
}

function requireNonEmptyString(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} is required.`);
  }
  return trimmed;
}

export function mergeUniquePaths(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right].map((item) => path.resolve(item)))).sort((a, b) =>
    a.localeCompare(b)
  );
}

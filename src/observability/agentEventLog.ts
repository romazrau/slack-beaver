import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config/config.js";

export type AgentEventLogMode = NonNullable<AppConfig["agentEventLog"]>["mode"];

export type AgentEventRole = "chat" | "planner" | "executor" | "reviewer" | "system";

export type AgentEventSlackMetadata = {
  userId?: string;
  channelId?: string;
  threadTs?: string;
  messageTs?: string;
};

export type AgentEventIo = {
  direction: "input" | "output" | "internal" | "error";
  kind: string;
  summary: string;
  payloadRedacted?: unknown;
  payload?: unknown;
};

export type AgentEventLogEntry = {
  timestamp: string;
  localTime: string;
  traceId: string;
  turnId: string;
  conversationId: string;
  agentId: string;
  agentRole: AgentEventRole;
  event: string;
  source: string;
  slack?: AgentEventSlackMetadata;
  io: AgentEventIo;
};

export type AgentEventLogInput = Omit<AgentEventLogEntry, "timestamp" | "localTime" | "agentId"> & {
  agentId?: string;
};

const TAIPEI_TIME_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false
});

export async function writeAgentEventLog(config: AppConfig, event: AgentEventLogInput): Promise<void> {
  const now = new Date();
  const entry: AgentEventLogEntry = redactAgentEventEntry({
    timestamp: now.toISOString(),
    localTime: `${TAIPEI_TIME_FORMATTER.format(now).replace(",", ".")} Asia/Taipei`,
    agentId: event.agentId ?? "local-agent",
    ...event
  });
  const logDir = getAgentEventLogDir(config);
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(path.join(logDir, `${entry.timestamp.slice(0, 10)}.jsonl`), `${JSON.stringify(entry)}\n`, "utf8");
  await pruneOldAgentEventLogs(config).catch(() => undefined);
}

export function getAgentEventLogDir(config: AppConfig): string {
  return path.join(path.dirname(config.auditLogPath), "agent-events");
}

export function redactAgentEventEntry(entry: AgentEventLogEntry): AgentEventLogEntry {
  return redactValue(entry) as AgentEventLogEntry;
}

async function pruneOldAgentEventLogs(config: AppConfig): Promise<void> {
  const settings = getAgentEventLogSettings(config);
  const retentionDays =
    settings.mode === "full_local_debug" ? settings.fullDebugRetentionDays : settings.retentionDays;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const logDir = getAgentEventLogDir(config);
  let entries: string[];
  try {
    entries = await fs.readdir(logDir);
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((entry) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry))
      .map(async (entry) => {
        const day = entry.slice(0, 10);
        if (new Date(`${day}T00:00:00.000Z`).getTime() < cutoff) {
          await fs.rm(path.join(logDir, entry), { force: true });
        }
      })
  );
}

export function getAgentEventLogSettings(config: AppConfig): NonNullable<AppConfig["agentEventLog"]> {
  return {
    mode: config.agentEventLog?.mode ?? "summary",
    retentionDays: config.agentEventLog?.retentionDays ?? 14,
    fullDebugRetentionDays: config.agentEventLog?.fullDebugRetentionDays ?? 3
  };
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : redactValue(nested)
      ])
    );
  }
  return value;
}

function isSensitiveKey(key: string): boolean {
  return /token|secret|password|api[_-]?key|private[_-]?key/i.test(key);
}

function redactString(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[REDACTED_OPENAI_TOKEN]")
    .replace(/xox[abpors]-[A-Za-z0-9-]{12,}/g, "[REDACTED_SLACK_TOKEN]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
}

import path from "node:path";

export type AppConfig = {
  slack: {
    socketModeEnabled: boolean;
    botToken?: string;
    appToken?: string;
  };
  localFiles: {
    watchedFolders: string[];
    denylistFolders: string[];
    maxFileBytes: number;
    maxResults: number;
  };
  localMemory: {
    enabled: boolean;
    dbPath: string;
    openAiTokenPath: string;
  };
  ai: {
    openAiModel: string;
    maxToolTurns: number;
    maxConversationFullTurns: number;
    conversationRecentTurnsAfterSummary: number;
  };
  auditLogPath: string;
};

type Env = Record<string, string | undefined>;

type LoadConfigOptions = {
  requireSlackTokens?: boolean;
};

const DEFAULT_MAX_FILE_BYTES = 1_048_576;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_AUDIT_LOG_PATH = "./logs/audit.jsonl";
const DEFAULT_LOCAL_MEMORY_DB_PATH = "./data/slack-beaver.sqlite";
const DEFAULT_OPENAI_TOKEN_PATH = "./tokens/openai.key";
const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const DEFAULT_MAX_AGENT_TOOL_TURNS = 2;
const DEFAULT_MAX_CONVERSATION_FULL_TURNS = 8;
const DEFAULT_CONVERSATION_RECENT_TURNS_AFTER_SUMMARY = 4;

export function loadConfig(env: Env = process.env, options: LoadConfigOptions = {}): AppConfig {
  const requireSlackTokens = options.requireSlackTokens ?? true;
  const socketModeEnabled = parseBoolean(env.SLACK_SOCKET_MODE_ENABLED, true);
  const watchedFolders = parsePathList(env.WATCHED_FOLDERS);
  const denylistFolders = parsePathList(env.DENYLIST_FOLDERS);
  const localMemoryEnabled = parseBoolean(env.LOCAL_MEMORY_ENABLED, true);
  const maxFileBytes = parsePositiveInteger(
    env.MAX_LOCAL_FILE_BYTES,
    DEFAULT_MAX_FILE_BYTES,
    "MAX_LOCAL_FILE_BYTES"
  );
  const maxResults = parsePositiveInteger(
    env.MAX_SEARCH_RESULTS,
    DEFAULT_MAX_RESULTS,
    "MAX_SEARCH_RESULTS"
  );
  const maxToolTurns = parsePositiveInteger(
    env.MAX_AGENT_TOOL_TURNS,
    DEFAULT_MAX_AGENT_TOOL_TURNS,
    "MAX_AGENT_TOOL_TURNS"
  );
  const maxConversationFullTurns = parsePositiveInteger(
    env.MAX_CONVERSATION_FULL_TURNS,
    DEFAULT_MAX_CONVERSATION_FULL_TURNS,
    "MAX_CONVERSATION_FULL_TURNS"
  );
  const conversationRecentTurnsAfterSummary = parsePositiveInteger(
    env.CONVERSATION_RECENT_TURNS_AFTER_SUMMARY,
    DEFAULT_CONVERSATION_RECENT_TURNS_AFTER_SUMMARY,
    "CONVERSATION_RECENT_TURNS_AFTER_SUMMARY"
  );

  const errors: string[] = [];

  if (requireSlackTokens && socketModeEnabled) {
    if (!env.SLACK_BOT_TOKEN) {
      errors.push("SLACK_BOT_TOKEN is required when SLACK_SOCKET_MODE_ENABLED is true.");
    }
    if (!env.SLACK_APP_TOKEN) {
      errors.push("SLACK_APP_TOKEN is required when SLACK_SOCKET_MODE_ENABLED is true.");
    }
  }

  if (!localMemoryEnabled && watchedFolders.length === 0) {
    errors.push("WATCHED_FOLDERS must include at least one absolute folder path.");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n- ${errors.join("\n- ")}`);
  }

  return {
    slack: {
      socketModeEnabled,
      botToken: env.SLACK_BOT_TOKEN,
      appToken: env.SLACK_APP_TOKEN
    },
    localFiles: {
      watchedFolders,
      denylistFolders,
      maxFileBytes,
      maxResults
    },
    localMemory: {
      enabled: localMemoryEnabled,
      dbPath: env.LOCAL_MEMORY_DB_PATH ?? DEFAULT_LOCAL_MEMORY_DB_PATH,
      openAiTokenPath: env.OPENAI_TOKEN_PATH ?? DEFAULT_OPENAI_TOKEN_PATH
    },
    ai: {
      openAiModel: env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
      maxToolTurns,
      maxConversationFullTurns,
      conversationRecentTurnsAfterSummary
    },
    auditLogPath: env.AUDIT_LOG_PATH ?? DEFAULT_AUDIT_LOG_PATH
  };
}

function parsePathList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parsePositiveInteger(
  value: string | undefined,
  defaultValue: number,
  name: string
): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

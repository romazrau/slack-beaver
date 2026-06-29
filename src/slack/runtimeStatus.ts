import type { AppConfig } from "../config/config.js";
import { LocalMemoryStore, mergeUniquePaths } from "../memory/localMemory.js";

export const LOCAL_AGENT_RUNTIME_PROCESS = "local-agent";

export const STATUS_NOTICE_CHANNEL_SETTING_KEY = "slack.status_notice_channel";

export type RuntimeNoticeKind = "online" | "offline";

export type RuntimeNoticeTarget =
  | { channelId: string; source: "env" | "subscribed" | "recent_conversation" }
  | { channelId: undefined; source: "none" };

export type RuntimeStatusSnapshot = {
  envFolders: string[];
  conversationFolders: string[];
  effectiveFolders: string[];
  openAiTokenConfigured: boolean;
  googleWorkspaceConfigured: boolean;
  googleWorkspaceEnabled: boolean;
  localAgentLastSeenAt?: string;
  noticeTarget: RuntimeNoticeTarget;
  localMemoryEnabled: boolean;
};

export type SlackNoticeClient = {
  chat: {
    postMessage(input: { channel: string; text: string }): Promise<unknown>;
  };
};

export function buildRuntimeStatusSnapshot(config: AppConfig): RuntimeStatusSnapshot {
  if (!config.localMemory.enabled) {
    return {
      envFolders: config.localFiles.watchedFolders,
      conversationFolders: [],
      effectiveFolders: config.localFiles.watchedFolders,
      openAiTokenConfigured: false,
      googleWorkspaceConfigured: false,
      googleWorkspaceEnabled: config.googleWorkspace.enabled,
      noticeTarget: resolveRuntimeNoticeTarget(config),
      localMemoryEnabled: false
    };
  }

  const store = new LocalMemoryStore(config.localMemory.dbPath);
  try {
    return buildRuntimeStatusSnapshotFromStore(config, store);
  } finally {
    store.close();
  }
}

export function buildRuntimeStatusSnapshotFromStore(
  config: AppConfig,
  store: LocalMemoryStore
): RuntimeStatusSnapshot {
  const conversationFolders = store.listEnabledAllowedFolderPaths();
  const runtimeStatus = store.getRuntimeStatus(LOCAL_AGENT_RUNTIME_PROCESS);
  return {
    envFolders: config.localFiles.watchedFolders,
    conversationFolders,
    effectiveFolders: mergeUniquePaths(config.localFiles.watchedFolders, conversationFolders),
    openAiTokenConfigured: store.getProviderConfig("openai")?.tokenConfigured ?? false,
    googleWorkspaceConfigured: store.getProviderConfig("google")?.tokenConfigured ?? false,
    googleWorkspaceEnabled: config.googleWorkspace.enabled,
    localAgentLastSeenAt: runtimeStatus?.lastSeenAt,
    noticeTarget: resolveRuntimeNoticeTarget(config, store),
    localMemoryEnabled: true
  };
}

export function resolveRuntimeNoticeTarget(
  config: AppConfig,
  store?: LocalMemoryStore
): RuntimeNoticeTarget {
  if (config.slack.statusChannelId) {
    return {
      channelId: config.slack.statusChannelId,
      source: "env"
    };
  }

  if (store) {
    const saved = parseSavedNoticeTarget(store.getSetting(STATUS_NOTICE_CHANNEL_SETTING_KEY)?.value);
    if (saved) {
      return {
        channelId: saved.channelId,
        source: "subscribed"
      };
    }

    const recent = store.getMostRecentConversation();
    if (recent) {
      return {
        channelId: recent.channelId,
        source: "recent_conversation"
      };
    }
  }

  return {
    channelId: undefined,
    source: "none"
  };
}

export function saveRuntimeNoticeTarget(
  store: LocalMemoryStore,
  input: { channelId: string; slackUserId: string }
): void {
  store.setSetting(
    STATUS_NOTICE_CHANNEL_SETTING_KEY,
    JSON.stringify({
      channelId: input.channelId,
      slackUserId: input.slackUserId
    })
  );
}

export function formatFoldersResponse(snapshot: Pick<RuntimeStatusSnapshot, "envFolders" | "conversationFolders" | "effectiveFolders">): string {
  return [
    "*Readable local folders*",
    formatFolderGroup("env", snapshot.envFolders),
    formatFolderGroup("conversation", snapshot.conversationFolders),
    formatFolderGroup("effective", snapshot.effectiveFolders)
  ].join("\n");
}

export function formatStatusResponse(snapshot: RuntimeStatusSnapshot): string {
  return [
    "*Local Agent status*",
    `Runtime: ${snapshot.localAgentLastSeenAt ? `online, last heartbeat ${escapeSlackText(snapshot.localAgentLastSeenAt)}` : snapshot.localMemoryEnabled ? "not seen yet" : "not tracked"}`,
    `AI agent token: ${snapshot.openAiTokenConfigured ? "configured locally" : "not configured"}`,
    `Google Workspace: ${formatGoogleStatus(snapshot)}`,
    `Lifecycle notices: ${formatNoticeTarget(snapshot.noticeTarget)}`,
    "",
    formatFoldersResponse(snapshot),
    "",
    "*Available commands*",
    "`find <query>`",
    "`ask <question>`",
    "`folders list`",
    "`folders add /absolute/path/to/folder`",
    "`confirm folders add /absolute/path/to/folder`",
    "`folders remove /absolute/path/to/folder`",
    "`status`",
    "`status subscribe`"
  ].join("\n");
}

export function formatRuntimeNotice(kind: RuntimeNoticeKind, snapshot: RuntimeStatusSnapshot, now = new Date()): string {
  const state = kind === "online" ? "online" : "offline";
  return [
    `*Slack Beaver Local Agent is ${state}*`,
    `Timestamp: ${now.toISOString()}`,
    `AI agent token: ${snapshot.openAiTokenConfigured ? "configured locally" : "not configured"}`,
    `Google Workspace: ${formatGoogleStatus(snapshot)}`,
    `Lifecycle notices: ${formatNoticeTarget(snapshot.noticeTarget)}`,
    "",
    formatFoldersResponse(snapshot),
    "",
    "*Available commands*",
    "`find <query>`, `ask <question>`, `folders list`, `folders add /absolute/path`, `confirm folders add /absolute/path`, `folders remove /absolute/path`, `status`, `status subscribe`"
  ].join("\n");
}

export async function sendRuntimeNotice(input: {
  client: SlackNoticeClient;
  config: AppConfig;
  kind: RuntimeNoticeKind;
  now?: Date;
  logger?: { info?: (message: string) => void; warn?: (message: string) => void; error?: (message: string) => void };
}): Promise<RuntimeNoticeTarget> {
  const snapshot = buildRuntimeStatusSnapshot(input.config);
  const text = formatRuntimeNotice(input.kind, snapshot, input.now);
  if (!snapshot.noticeTarget.channelId) {
    input.logger?.info?.(text);
    input.logger?.warn?.(
      "No Slack lifecycle notice target configured. Set LOCAL_AGENT_STATUS_CHANNEL_ID or send `status subscribe`."
    );
    return snapshot.noticeTarget;
  }

  try {
    await input.client.chat.postMessage({
      channel: snapshot.noticeTarget.channelId,
      text
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Slack notice error";
    input.logger?.error?.(`Unable to send Local Agent ${input.kind} notice: ${message}`);
  }
  return snapshot.noticeTarget;
}

function parseSavedNoticeTarget(value: string | undefined): { channelId: string } | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as { channelId?: unknown };
    return typeof parsed.channelId === "string" && parsed.channelId.trim()
      ? { channelId: parsed.channelId.trim() }
      : undefined;
  } catch {
    return undefined;
  }
}

function formatFolderGroup(label: string, folders: string[]): string {
  if (folders.length === 0) {
    return `*${label}*: none`;
  }

  return [`*${label}*:`, ...folders.map((folder) => `- \`${escapeInlineCode(folder)}\``)].join("\n");
}

function formatNoticeTarget(target: RuntimeNoticeTarget): string {
  if (!target.channelId) {
    return "not configured; set `LOCAL_AGENT_STATUS_CHANNEL_ID` or send `status subscribe`";
  }

  return `${target.source} \`${escapeInlineCode(target.channelId)}\``;
}

function formatGoogleStatus(snapshot: RuntimeStatusSnapshot): string {
  if (!snapshot.googleWorkspaceEnabled) {
    return "disabled";
  }

  return snapshot.googleWorkspaceConfigured ? "connected locally" : "enabled but not connected";
}

function escapeSlackText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeInlineCode(value: string): string {
  return escapeSlackText(value).replaceAll("`", "'");
}

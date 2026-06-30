import slackBolt from "@slack/bolt";
import type { App as SlackBoltApp, Logger } from "@slack/bolt";
import { runAgentTextCommand } from "../agent/agentCommands.js";
import type { AppConfig } from "../config/config.js";
import { LocalMemoryStore, mergeUniquePaths } from "../memory/localMemory.js";
import { buildAppHomeView } from "./appHomeView.js";
import {
  LOCAL_AGENT_RUNTIME_PROCESS,
  sendRuntimeNotice,
  type RuntimeNoticeKind,
  type SlackNoticeClient
} from "./runtimeStatus.js";
import { buildSlackMarkdownMessage, type SlackMarkdownMessage } from "./slackMarkdown.js";

export function createSlackApp(config: AppConfig): SlackBoltApp {
  if (!config.slack.botToken || !config.slack.appToken) {
    throw new Error("Slack tokens are required to create the Slack app.");
  }

  const runtimeStartedAt = new Date();
  const receiver = new slackBolt.SocketModeReceiver({
    appToken: config.slack.appToken
  });
  protectSocketModeClientFromConnectingDisconnect(receiver.client);
  const app = new slackBolt.App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    receiver,
    socketMode: true
  });

  app.command("/agent", async ({ command, ack, respond, logger }) => {
    await ack();

    const response = await runAgentTextCommand({
      text: command.text,
      slackUserId: command.user_id,
      channelId: command.channel_id,
      source: "slash_command",
      config,
      logger
    });
    await respond(formatSlackAgentReply(response));
  });

  app.event("app_home_opened", async ({ event, client, logger }) => {
    try {
      const state = loadAppHomeState(config);
      await client.views.publish({
        user_id: event.user,
        view: buildAppHomeView(config, state)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(message);
    }
  });

  app.message(async ({ message, say, logger }) => {
    if (!isDirectUserMessage(message)) {
      return;
    }

    if (isMessageBeforeRuntimeStart(message, runtimeStartedAt)) {
      logger.warn(
        `Ignoring stale Slack DM from before Local Agent startup: channel=${message.channel} ts=${message.ts}`
      );
      return;
    }

    const response = await runAgentTextCommand({
      text: message.text,
      slackUserId: message.user,
      channelId: message.channel,
      threadTs: message.thread_ts,
      source: "app_home_message",
      config,
      logger
    });
    await say(formatSlackAgentReply(response));
  });

  return app;
}

export function formatSlackAgentReply(text: string): SlackMarkdownMessage {
  return buildSlackMarkdownMessage(text);
}

type SocketModeStateMachine = {
  getCurrentState: () => string;
};

type PatchableSocketModeClient = {
  stateMachine: SocketModeStateMachine;
  logger?: Pick<Logger, "warn">;
  onWebSocketMessage: (event: SocketModeMessageEvent) => Promise<void>;
};

type SocketModeMessageEvent = {
  data: unknown;
};

export function protectSocketModeClientFromConnectingDisconnect(client: unknown): void {
  const socketClient = client as PatchableSocketModeClient;
  const originalOnWebSocketMessage = socketClient.onWebSocketMessage.bind(socketClient);

  socketClient.onWebSocketMessage = async (event: SocketModeMessageEvent): Promise<void> => {
    if (isConnectingDisconnectEvent(socketClient.stateMachine, event.data)) {
      socketClient.logger?.warn?.(
        "Ignoring Slack Socket Mode server disconnect received before the connection handshake completed; waiting for the SDK reconnect path."
      );
      return;
    }

    await originalOnWebSocketMessage(event);
  };
}

function isConnectingDisconnectEvent(
  stateMachine: SocketModeStateMachine,
  data: unknown
): boolean {
  if (stateMachine.getCurrentState() !== "connecting") {
    return false;
  }

  const text = socketModeMessageDataToString(data);
  if (!text) {
    return false;
  }

  try {
    const message = JSON.parse(text) as { type?: unknown };
    return message.type === "disconnect";
  } catch {
    return false;
  }
}

function socketModeMessageDataToString(data: unknown): string | undefined {
  if (typeof data === "string") {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  return undefined;
}

function loadAppHomeState(config: AppConfig) {
  if (!config.localMemory.enabled) {
    return {
      allowedFolderCount: config.localFiles.watchedFolders.length,
      openAiTokenConfigured: false,
      localAgentLastSeenAt: undefined
    };
  }

  const store = new LocalMemoryStore(config.localMemory.dbPath);
  try {
    const runtimeStatus = store.recordRuntimeHeartbeat(LOCAL_AGENT_RUNTIME_PROCESS);
    const folders = mergeUniquePaths(
      config.localFiles.watchedFolders,
      store.listEnabledAllowedFolderPaths()
    );
    return {
      allowedFolderCount: folders.length,
      openAiTokenConfigured: store.getProviderConfig("openai")?.tokenConfigured ?? false,
      localAgentLastSeenAt: runtimeStatus.lastSeenAt
    };
  } finally {
    store.close();
  }
}

export function recordLocalAgentRuntimeHeartbeat(config: AppConfig): void {
  if (!config.localMemory.enabled) {
    return;
  }

  const store = new LocalMemoryStore(config.localMemory.dbPath);
  try {
    store.recordRuntimeHeartbeat(LOCAL_AGENT_RUNTIME_PROCESS);
  } finally {
    store.close();
  }
}

export async function sendLocalAgentRuntimeNotice(input: {
  app: SlackBoltApp;
  config: AppConfig;
  kind: RuntimeNoticeKind;
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
}): Promise<void> {
  await sendRuntimeNotice({
    client: input.app.client as SlackNoticeClient,
    config: input.config,
    kind: input.kind,
    logger: input.logger
  });
}

type SlackMessage = {
  channel_type?: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  channel?: string;
  text?: string;
  thread_ts?: string;
  ts?: string;
};

export function isDirectUserMessage(message: unknown): message is Required<
  Pick<SlackMessage, "user" | "channel" | "text">
> &
  SlackMessage {
  const candidate = message as SlackMessage;
  return (
    candidate.channel_type === "im" &&
    candidate.subtype === undefined &&
    candidate.bot_id === undefined &&
    typeof candidate.user === "string" &&
    typeof candidate.channel === "string" &&
    typeof candidate.text === "string"
  );
}

export function isMessageBeforeRuntimeStart(message: SlackMessage, runtimeStartedAt: Date): boolean {
  const messageTimeMs = parseSlackMessageTimestampMs(message.ts);
  if (messageTimeMs === undefined) {
    return false;
  }

  return messageTimeMs < runtimeStartedAt.getTime();
}

function parseSlackMessageTimestampMs(timestamp: string | undefined): number | undefined {
  if (!timestamp) {
    return undefined;
  }

  const match = /^(\d+)\.(\d{1,6})$/.exec(timestamp);
  if (!match) {
    return undefined;
  }

  const seconds = Number(match[1]);
  const microseconds = Number(match[2].padEnd(6, "0"));
  if (!Number.isSafeInteger(seconds) || !Number.isSafeInteger(microseconds)) {
    return undefined;
  }

  return seconds * 1000 + Math.floor(microseconds / 1000);
}

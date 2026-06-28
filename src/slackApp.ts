import slackBolt from "@slack/bolt";
import type { App as SlackBoltApp } from "@slack/bolt";
import { runAgentTextCommand } from "./agentCommands.js";
import { buildAppHomeView } from "./appHomeView.js";
import type { AppConfig } from "./config.js";
import { LocalMemoryStore, mergeUniquePaths } from "./localMemory.js";

export function createSlackApp(config: AppConfig): SlackBoltApp {
  if (!config.slack.botToken || !config.slack.appToken) {
    throw new Error("Slack tokens are required to create the Slack app.");
  }

  const app = new slackBolt.App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
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
    await respond(response);
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

    const response = await runAgentTextCommand({
      text: message.text,
      slackUserId: message.user,
      channelId: message.channel,
      source: "app_home_message",
      config,
      logger
    });
    await say(response);
  });

  return app;
}

function loadAppHomeState(config: AppConfig) {
  if (!config.localMemory.enabled) {
    return {
      allowedFolderCount: config.localFiles.watchedFolders.length,
      openAiTokenConfigured: false
    };
  }

  const store = new LocalMemoryStore(config.localMemory.dbPath);
  try {
    const folders = mergeUniquePaths(
      config.localFiles.watchedFolders,
      store.listEnabledAllowedFolderPaths()
    );
    return {
      allowedFolderCount: folders.length,
      openAiTokenConfigured: store.getProviderConfig("openai")?.tokenConfigured ?? false
    };
  } finally {
    store.close();
  }
}

type SlackMessage = {
  channel_type?: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  channel?: string;
  text?: string;
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

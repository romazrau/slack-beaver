import type { KnownBlock, View } from "@slack/bolt";
import type { AppConfig } from "./config.js";

export type AppHomeState = {
  allowedFolderCount?: number;
  openAiTokenConfigured?: boolean;
};

export function buildAppHomeView(config: AppConfig, state: AppHomeState = {}): View {
  const watchedFolderCount = state.allowedFolderCount ?? config.localFiles.watchedFolders.length;
  const setupBlocks = watchedFolderCount === 0 ? buildSetupBlocks() : [];

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Slack Beaver Local Agent"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Local Agent is the Slack bot backend and local file reader running on this computer."
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Socket Mode*\n${config.slack.socketModeEnabled ? "Enabled" : "Disabled"}`
        },
        {
          type: "mrkdwn",
          text: `*Allowed folders*\n${watchedFolderCount}`
        },
        {
          type: "mrkdwn",
          text: `*Denylist folders*\n${config.localFiles.denylistFolders.length}`
        },
        {
          type: "mrkdwn",
          text: `*Max results*\n${config.localFiles.maxResults}`
        }
      ]
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Chat command*\nOpen the Messages tab and type `find <query>`."
      }
    },
    ...setupBlocks,
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*OpenAI token*\n${state.openAiTokenConfigured ? "Configured locally" : "Not configured"}`
        },
        {
          type: "mrkdwn",
          text: "*Token setup*\nUse local CLI only"
        }
      ]
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "v1 is read-only and only searches allowlisted local folders. Secrets and token values are never accepted or shown in Slack."
        }
      ]
    }
  ];

  return {
    type: "home",
    blocks
  };
}

function buildSetupBlocks(): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Setup needed*\nNo local folders are allowed yet. Run `npm run agent:folders:add -- /absolute/path/to/folder` on this computer."
      }
    }
  ];
}

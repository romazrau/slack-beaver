import type { KnownBlock, View } from "@slack/bolt";
import type { AppConfig } from "../config/config.js";
import { formatSetupChecklist } from "./onboardingCopy.js";

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
        text: "*Chat command*\nOpen the Messages tab and type `find <query>`. Type `reset memory` to see local reset instructions."
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
          text: "*Token setup*\nLocal CLI only"
        }
      ]
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Secrets and token values are never accepted in Slack. Configure folders and OpenAI locally before enabling the AI agent."
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
        text: `*Setup needed*\n${formatSetupChecklist()}`
      }
    }
  ];
}

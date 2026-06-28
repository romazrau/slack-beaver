import type { KnownBlock, View } from "@slack/bolt";
import type { AppConfig } from "../config/config.js";
import { formatAgentTokenSetupSteps, formatSetupChecklist } from "./onboardingCopy.js";

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
        text: "*Chat command*\nOpen the Messages tab and type `find <query>` or `ask <question>`. Type `reset memory` to see local reset instructions."
      }
    },
    ...setupBlocks,
    ...buildAgentTokenBlocks(state.openAiTokenConfigured ?? false),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Secrets and token values are never accepted in Slack. Configure folders and the AI agent token locally before using AI answers."
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

function buildAgentTokenBlocks(openAiTokenConfigured: boolean): KnownBlock[] {
  if (openAiTokenConfigured) {
    return [
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: "*AI agent token*\nConfigured locally"
          },
          {
            type: "mrkdwn",
            text: "*AI answers*\nReady for `ask <question>`"
          }
        ]
      }
    ];
  }

  return [
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: "*AI agent token*\nNot configured"
        },
        {
          type: "mrkdwn",
          text: "*AI answers*\nSetup required"
        }
      ]
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Enable AI answers*\n${formatAgentTokenSetupSteps()}`
      }
    }
  ];
}

import type { KnownBlock, View } from "@slack/bolt";
import type { AppConfig } from "../config/config.js";
import { formatAgentTokenSetupSteps, formatSetupChecklist } from "./onboardingCopy.js";
import { formatLocalAgentOfflineResponse } from "./slackResponses.js";

export type AppHomeState = {
  allowedFolderCount?: number;
  openAiTokenConfigured?: boolean;
  localAgentLastSeenAt?: string;
  now?: Date;
};

const LOCAL_AGENT_STALE_AFTER_MS = 2 * 60 * 1000;

export function buildAppHomeView(config: AppConfig, state: AppHomeState = {}): View {
  const watchedFolderCount = state.allowedFolderCount ?? config.localFiles.watchedFolders.length;
  const setupBlocks = watchedFolderCount === 0 ? buildSetupBlocks() : [];
  const runtimeStatus = formatLocalAgentRuntimeStatus(
    state.localAgentLastSeenAt,
    state.now ?? new Date(),
    config.localMemory.enabled
  );

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
          text: `*Local Agent runtime*\n${runtimeStatus.label}`
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
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: runtimeStatus.detail
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

export function formatLocalAgentRuntimeStatus(
  lastSeenAt: string | undefined,
  now: Date,
  trackingEnabled = true
): { label: string; detail: string } {
  if (!trackingEnabled) {
    return {
      label: "Not tracked",
      detail: "Local Agent runtime heartbeat is not tracked because `LOCAL_MEMORY_ENABLED` is false."
    };
  }

  if (!lastSeenAt) {
    return {
      label: "Not seen yet",
      detail: formatLocalAgentOfflineResponse()
    };
  }

  const lastSeenMs = Date.parse(lastSeenAt);
  if (Number.isNaN(lastSeenMs)) {
    return {
      label: "Unknown",
      detail:
        "Local Agent runtime heartbeat exists but its timestamp is not readable. Restart with `npm run dev`."
    };
  }

  const ageMs = now.getTime() - lastSeenMs;
  const isOnline = ageMs <= LOCAL_AGENT_STALE_AFTER_MS;
  const label = isOnline ? "Online" : "Stale";
  return {
    label,
    detail: isOnline
      ? `Last Local Agent heartbeat: ${lastSeenAt}`
      : `Last Local Agent heartbeat: ${lastSeenAt}\n${formatLocalAgentOfflineResponse()}`
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

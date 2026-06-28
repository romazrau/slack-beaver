import type { KnownBlock, View } from "@slack/bolt";
import type { AppConfig } from "./config.js";

export function buildAppHomeView(config: AppConfig): View {
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
          text: `*Watched folders*\n${config.localFiles.watchedFolders.length}`
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
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "v1 is read-only and only searches allowlisted local folders. Secrets and token values are never shown here."
        }
      ]
    }
  ];

  return {
    type: "home",
    blocks
  };
}

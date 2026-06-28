import { App } from "@slack/bolt";
import type { AppConfig } from "./config.js";
import { writeAuditLog } from "./auditLog.js";
import { searchLocalFiles } from "./localSearch.js";
import {
  formatErrorResponse,
  formatSearchResponse,
  parseAgentCommand
} from "./slackResponses.js";

export function createSlackApp(config: AppConfig): App {
  if (!config.slack.botToken || !config.slack.appToken) {
    throw new Error("Slack tokens are required to create the Slack app.");
  }

  const app = new App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    socketMode: true
  });

  app.command("/agent", async ({ command, ack, respond, logger }) => {
    await ack();

    const parsed = parseAgentCommand(command.text);
    if (parsed.type === "invalid") {
      await respond(parsed.reason);
      return;
    }

    try {
      const results = await searchLocalFiles(parsed.query, config.localFiles);
      await writeAuditLog(config.auditLogPath, {
        timestamp: new Date().toISOString(),
        slackUserId: command.user_id,
        channelId: command.channel_id,
        query: parsed.query,
        resultCount: results.length,
        status: "success"
      });
      await respond(formatSearchResponse(parsed.query, results));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(message);
      await writeAuditLog(config.auditLogPath, {
        timestamp: new Date().toISOString(),
        slackUserId: command.user_id,
        channelId: command.channel_id,
        query: parsed.query,
        resultCount: 0,
        status: "error",
        errorSummary: message
      });
      await respond(formatErrorResponse(message));
    }
  });

  return app;
}

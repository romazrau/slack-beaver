import type { AppConfig } from "./config.js";
import { writeAuditLog } from "./auditLog.js";
import { searchLocalFiles } from "./localSearch.js";
import { formatErrorResponse, formatSearchResponse, parseAgentCommand } from "./slackResponses.js";

export type AgentCommandSource = "slash_command" | "app_home_message";

export type RunAgentTextCommandInput = {
  text: string;
  slackUserId: string;
  channelId: string;
  source: AgentCommandSource;
  config: AppConfig;
  logger?: {
    error: (message: string) => void;
  };
};

export async function runAgentTextCommand(input: RunAgentTextCommandInput): Promise<string> {
  const parsed = parseAgentCommand(input.text);
  if (parsed.type === "invalid") {
    return formatInvalidCommandReason(parsed.reason, input.source);
  }

  try {
    const results = await searchLocalFiles(parsed.query, input.config.localFiles);
    await writeAuditLog(input.config.auditLogPath, {
      timestamp: new Date().toISOString(),
      slackUserId: input.slackUserId,
      channelId: input.channelId,
      query: parsed.query,
      resultCount: results.length,
      status: "success",
      source: input.source
    });
    return formatSearchResponse(parsed.query, results);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    input.logger?.error(message);
    await writeAuditLog(input.config.auditLogPath, {
      timestamp: new Date().toISOString(),
      slackUserId: input.slackUserId,
      channelId: input.channelId,
      query: parsed.query,
      resultCount: 0,
      status: "error",
      source: input.source,
      errorSummary: message
    });
    return formatErrorResponse(message);
  }
}

function formatInvalidCommandReason(reason: string, source: AgentCommandSource): string {
  if (source === "slash_command") {
    return reason;
  }

  return reason.replaceAll("/agent find <query>", "find <query>");
}

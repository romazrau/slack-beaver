import type { AppConfig } from "./config.js";
import { writeAuditLog } from "./auditLog.js";
import { LocalMemoryStore, mergeUniquePaths } from "./localMemory.js";
import { formatErrorResponse, formatSearchResponse, parseAgentCommand } from "./slackResponses.js";
import { looksLikeAiToken } from "./secretSetup.js";
import { runLocalSearchTool } from "./toolRegistry.js";

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
  if (looksLikeAiToken(input.text)) {
    return "I cannot accept API keys or paid tokens in Slack. Configure secrets locally with `npm run agent:secrets:set-openai`.";
  }

  const parsed = parseAgentCommand(input.text);
  if (parsed.type === "invalid") {
    return formatInvalidCommandReason(parsed.reason, input.source);
  }

  const memoryStore = input.config.localMemory.enabled
    ? new LocalMemoryStore(input.config.localMemory.dbPath)
    : undefined;

  try {
    const memoryFolders = memoryStore?.listEnabledAllowedFolderPaths() ?? [];
    const watchedFolders = mergeUniquePaths(input.config.localFiles.watchedFolders, memoryFolders);
    if (watchedFolders.length === 0) {
      return [
        "No local folders are allowed yet.",
        "Add one on this computer with `npm run agent:folders:add -- /absolute/path/to/folder`, then try `find <query>` again."
      ].join("\n");
    }

    const config = {
      ...input.config,
      localFiles: {
        ...input.config.localFiles,
        watchedFolders
      }
    };
    const results = await runLocalSearchTool(parsed.query, {
      source: input.source,
      config,
      memoryStore
    });
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
  } finally {
    memoryStore?.close();
  }
}

function formatInvalidCommandReason(reason: string, source: AgentCommandSource): string {
  if (source === "slash_command") {
    return reason;
  }

  return reason.replaceAll("/agent find <query>", "find <query>");
}

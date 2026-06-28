import type { AppConfig } from "../config/config.js";
import { LocalMemoryStore, mergeUniquePaths } from "../memory/localMemory.js";
import { writeAuditLog } from "../observability/auditLog.js";
import {
  formatNoFoldersGuidance,
  formatResetMemorySlackGuidance,
  formatTokenRefusalGuidance
} from "../slack/onboardingCopy.js";
import { formatErrorResponse, formatSearchResponse, parseAgentCommand } from "../slack/slackResponses.js";
import { looksLikeAiToken } from "../setup/secretSetup.js";
import { runAgentQuestion, type AgentModelClient } from "./agentRunner.js";
import { runLocalSearchTool } from "./toolRegistry.js";

export type AgentCommandSource = "slash_command" | "app_home_message";

export type RunAgentTextCommandInput = {
  text: string;
  slackUserId: string;
  channelId: string;
  source: AgentCommandSource;
  config: AppConfig;
  modelClient?: AgentModelClient;
  logger?: {
    error: (message: string) => void;
  };
};

export async function runAgentTextCommand(input: RunAgentTextCommandInput): Promise<string> {
  if (looksLikeAiToken(input.text)) {
    return formatTokenRefusalGuidance();
  }

  if (isResetMemoryRequest(input.text)) {
    return formatResetMemorySlackGuidance();
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
      return formatNoFoldersGuidance();
    }

    const config = {
      ...input.config,
      localFiles: {
        ...input.config.localFiles,
        watchedFolders
      }
    };

    if (parsed.type === "ask") {
      const answer = await runAgentQuestion({
        question: parsed.question,
        source: input.source,
        config,
        memoryStore,
        modelClient: input.modelClient
      });
      await writeAuditLog(input.config.auditLogPath, {
        timestamp: new Date().toISOString(),
        slackUserId: input.slackUserId,
        channelId: input.channelId,
        query: parsed.question,
        resultCount: answer.toolCallCount,
        status: "success",
        source: input.source
      });
      return answer.answer;
    }

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
      query: parsed.type === "ask" ? parsed.question : parsed.query,
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

function isResetMemoryRequest(text: string): boolean {
  return text.trim().toLowerCase() === "reset memory";
}

function formatInvalidCommandReason(reason: string, source: AgentCommandSource): string {
  if (source === "slash_command") {
    return reason;
  }

  return reason
    .replaceAll("/agent find <query>", "find <query>")
    .replaceAll("/agent ask <question>", "ask <question>");
}

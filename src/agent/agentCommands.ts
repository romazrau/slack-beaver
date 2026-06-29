import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config/config.js";
import { LocalMemoryStore, mergeUniquePaths } from "../memory/localMemory.js";
import { writeAuditLog } from "../observability/auditLog.js";
import {
  formatNoFoldersGuidance,
  formatResetMemorySlackGuidance,
  formatTokenRefusalGuidance
} from "../slack/onboardingCopy.js";
import type { GoogleWorkspaceClient } from "../google/googleWorkspace.js";
import { formatErrorResponse, formatSearchResponse, parseAgentCommand } from "../slack/slackResponses.js";
import {
  buildRuntimeStatusSnapshot,
  buildRuntimeStatusSnapshotFromStore,
  formatFoldersResponse,
  formatStatusResponse,
  saveRuntimeNoticeTarget
} from "../slack/runtimeStatus.js";
import { looksLikeAiToken } from "../setup/secretSetup.js";
import { validateAllowedFolderInput } from "../setup/folderSetup.js";
import {
  handleAgentContinuationReply,
  runAgentConversation,
  runAgentQuestion,
  type AgentModelClient
} from "./agentRunner.js";
import { runLocalSearchTool } from "./toolRegistry.js";

export type AgentCommandSource = "slash_command" | "app_home_message";

export type RunAgentTextCommandInput = {
  text: string;
  slackUserId: string;
  channelId: string;
  threadTs?: string;
  source: AgentCommandSource;
  config: AppConfig;
  modelClient?: AgentModelClient;
  summarizerClient?: AgentModelClient;
  googleWorkspaceClient?: GoogleWorkspaceClient;
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

  const runtimeCommand = parseRuntimeCommand(input.text);
  if (runtimeCommand) {
    return handleRuntimeCommand(runtimeCommand, input);
  }

  const memoryStore = input.config.localMemory.enabled
    ? new LocalMemoryStore(input.config.localMemory.dbPath)
    : undefined;

  const parsed = parseAgentCommand(input.text);
  const shouldRunNaturalConversation = parsed.type === "invalid" && input.source === "app_home_message";
  let preserveContinuationOnTerminal = false;

  try {
    if (memoryStore) {
      const memoryFolders = memoryStore.listEnabledAllowedFolderPaths();
      const watchedFolders = mergeUniquePaths(input.config.localFiles.watchedFolders, memoryFolders);
      const continuationConfig = {
        ...input.config,
        localFiles: {
          ...input.config.localFiles,
          watchedFolders
        }
      };
      const continuationReply = await handleAgentContinuationReply({
        text: input.text,
        slackUserId: input.slackUserId,
        channelId: input.channelId,
        threadTs: input.threadTs,
        source: input.source,
        config: continuationConfig,
        memoryStore,
        modelClient: input.modelClient,
        googleWorkspaceClient: input.googleWorkspaceClient,
        observability: {
          slack: {
            userId: input.slackUserId,
            channelId: input.channelId,
            threadTs: input.threadTs
          }
        }
      });
      if (continuationReply && "continueNormal" in continuationReply && continuationReply.continueNormal === true) {
        preserveContinuationOnTerminal = continuationReply.preserveContinuationOnTerminal;
      } else if (continuationReply && "answer" in continuationReply) {
        await writeAuditLog(input.config.auditLogPath, {
          timestamp: new Date().toISOString(),
          slackUserId: input.slackUserId,
          channelId: input.channelId,
          query: input.text,
          resultCount: continuationReply.toolCallCount,
          status: "success",
          source: input.source
        });
        return continuationReply.answer;
      }
    }

    if (parsed.type === "invalid" && !shouldRunNaturalConversation) {
      return formatInvalidCommandReason(parsed.reason, input.source);
    }

    const memoryFolders = memoryStore?.listEnabledAllowedFolderPaths() ?? [];
    const watchedFolders = mergeUniquePaths(input.config.localFiles.watchedFolders, memoryFolders);
    if (!shouldRunNaturalConversation && watchedFolders.length === 0) {
      return formatNoFoldersGuidance();
    }

    const config = {
      ...input.config,
      localFiles: {
        ...input.config.localFiles,
        watchedFolders
      }
    };

    if (shouldRunNaturalConversation) {
      const answer = await runAgentConversation({
        message: input.text,
        slackUserId: input.slackUserId,
        channelId: input.channelId,
        threadTs: input.threadTs,
        source: input.source,
        config,
        memoryStore,
        modelClient: input.modelClient,
        summarizerClient: input.summarizerClient,
        googleWorkspaceClient: input.googleWorkspaceClient,
        preserveContinuationOnTerminal,
        observability: {
          slack: {
            userId: input.slackUserId,
            channelId: input.channelId,
            threadTs: input.threadTs
          }
        }
      });
      await writeAuditLog(input.config.auditLogPath, {
        timestamp: new Date().toISOString(),
        slackUserId: input.slackUserId,
        channelId: input.channelId,
        query: input.text,
        resultCount: answer.toolCallCount,
        status: "success",
        source: input.source
      });
      return answer.answer;
    }

    if (parsed.type === "ask") {
      const answer = await runAgentQuestion({
        question: parsed.question,
        slackUserId: input.slackUserId,
        channelId: input.channelId,
        threadTs: input.threadTs,
        source: input.source,
        config,
        memoryStore,
        modelClient: input.modelClient,
        googleWorkspaceClient: input.googleWorkspaceClient,
        preserveContinuationOnTerminal,
        observability: {
          slack: {
            userId: input.slackUserId,
            channelId: input.channelId,
            threadTs: input.threadTs
          }
        }
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

    if (parsed.type !== "find") {
      return formatInvalidCommandReason(parsed.reason, input.source);
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
      query: parsed.type === "ask" ? parsed.question : parsed.type === "find" ? parsed.query : input.text,
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

type RuntimeCommand =
  | { type: "folders_list" }
  | { type: "folders_add"; folderPath: string }
  | { type: "folders_confirm_add"; folderPath: string }
  | { type: "folders_remove"; folderPath: string }
  | { type: "status" }
  | { type: "status_subscribe" };

async function handleRuntimeCommand(
  command: RuntimeCommand,
  input: RunAgentTextCommandInput
): Promise<string> {
  const memoryStore = input.config.localMemory.enabled
    ? new LocalMemoryStore(input.config.localMemory.dbPath)
    : undefined;

  try {
    if (command.type === "folders_list") {
      const snapshot = memoryStore
        ? buildRuntimeStatusSnapshotFromStore(input.config, memoryStore)
        : buildRuntimeStatusSnapshot(input.config);
      return formatFoldersResponse(snapshot);
    }

    if (command.type === "status") {
      const snapshot = memoryStore
        ? buildRuntimeStatusSnapshotFromStore(input.config, memoryStore)
        : buildRuntimeStatusSnapshot(input.config);
      return formatStatusResponse(snapshot);
    }

    if (!memoryStore) {
      return "Local memory is disabled, so Slack cannot save runtime folder or status settings.";
    }

    if (command.type === "folders_add" || command.type === "folders_confirm_add") {
      return await saveAllowedFolderFromCommand({
        folderPath: command.folderPath,
        config: input.config,
        memoryStore,
        confirmed: command.type === "folders_confirm_add"
      });
    }

    if (command.type === "folders_remove") {
      const resolvedPath = await resolveFolderPathForRemoval(command.folderPath);
      const removed = memoryStore.disableAllowedFolder(resolvedPath);
      if (removed) {
        return `Conversation-added folder disabled: \`${escapeInlineCode(resolvedPath)}\``;
      }

      const inputPath = path.resolve(command.folderPath.trim());
      if (
        input.config.localFiles.watchedFolders.some(
          (folder) => folder === resolvedPath || folder === inputPath
        )
      ) {
        return "That folder comes from `WATCHED_FOLDERS` and cannot be removed from Slack. Edit local `.env` to change env defaults.";
      }

      return "No enabled conversation-added folder matched that path.";
    }

    saveRuntimeNoticeTarget(memoryStore, {
      channelId: input.channelId,
      slackUserId: input.slackUserId
    });
    return [
      "Lifecycle notices will be sent to this Slack conversation.",
      `Channel: \`${escapeInlineCode(input.channelId)}\``
    ].join("\n");
  } finally {
    memoryStore?.close();
  }
}

function parseRuntimeCommand(text: string): RuntimeCommand | undefined {
  const trimmed = text.trim();
  const [command, subcommand, ...rest] = trimmed.split(/\s+/);
  const normalizedCommand = command?.toLowerCase();
  const normalizedSubcommand = subcommand?.toLowerCase();

  if (normalizedCommand === "status" && !normalizedSubcommand) {
    return { type: "status" };
  }
  if (normalizedCommand === "status" && normalizedSubcommand === "subscribe" && rest.length === 0) {
    return { type: "status_subscribe" };
  }
  if (normalizedCommand === "confirm" && normalizedSubcommand === "folders") {
    const [confirmAction, ...confirmRest] = rest;
    if (confirmAction?.toLowerCase() === "add") {
      return { type: "folders_confirm_add", folderPath: confirmRest.join(" ").trim() };
    }
    return undefined;
  }
  if (normalizedCommand !== "folders") {
    return undefined;
  }
  if (normalizedSubcommand === "list" && rest.length === 0) {
    return { type: "folders_list" };
  }
  if (normalizedSubcommand === "add") {
    return { type: "folders_add", folderPath: rest.join(" ").trim() };
  }
  if (normalizedSubcommand === "remove") {
    return { type: "folders_remove", folderPath: rest.join(" ").trim() };
  }
  return undefined;
}

async function saveAllowedFolderFromCommand(input: {
  folderPath: string;
  config: AppConfig;
  memoryStore: LocalMemoryStore;
  confirmed: boolean;
}): Promise<string> {
  const validation = await validateAllowedFolderInput(
    input.folderPath,
    input.config.localFiles.denylistFolders
  );
  if (!validation.ok) {
    return validation.reason;
  }
  input.memoryStore.upsertAllowedFolder(validation.path);
  return [
    input.confirmed
      ? "Confirmed. Allowed folder saved for this Local Agent:"
      : "Allowed folder saved for this Local Agent:",
    `\`${escapeInlineCode(validation.path)}\``,
    "",
    "It is now part of the effective readable local-file scope."
  ].join("\n");
}

async function resolveFolderPathForRemoval(folderPath: string): Promise<string> {
  const trimmed = folderPath.trim();
  try {
    return path.resolve(await fs.realpath(trimmed));
  } catch {
    return path.resolve(trimmed);
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

function escapeInlineCode(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("`", "'");
}

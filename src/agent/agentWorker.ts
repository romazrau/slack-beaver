import os from "node:os";
import type { AgentTask } from "../center-db/agentTasks.js";
import type { AppConfig } from "../config/config.js";
import { LocalMemoryStore, mergeUniquePaths } from "../memory/localMemory.js";
import type { GoogleWorkspaceClient } from "../google/googleWorkspace.js";
import { runAgentQuestion, type AgentModelClient } from "./agentRunner.js";
import type { CenterAgentTaskClient } from "./centerTaskClient.js";

export type AgentWorkerConfig = {
  agentId: string;
  ownerSlackUserId: string;
  displayName: string;
  leaseSeconds: number;
  capabilities: string[];
};

export type AgentTaskExecutor = (task: AgentTask) => Promise<AgentTaskExecutionResult>;

export type AgentTaskExecutionResult = {
  resultSummary: string;
};

export type RunAgentWorkerOnceInput = {
  client: CenterAgentTaskClient;
  worker: AgentWorkerConfig;
  executor: AgentTaskExecutor;
};

export type RunAgentWorkerOnceResult =
  | {
      claimed: false;
    }
  | {
      claimed: true;
      taskId: number;
      status: "completed" | "failed";
    };

const DEFAULT_RESULT_SUMMARY_MAX_CHARS = 4000;
const DEFAULT_ERROR_SUMMARY_MAX_CHARS = 1000;

export async function runAgentWorkerOnce(input: RunAgentWorkerOnceInput): Promise<RunAgentWorkerOnceResult> {
  await input.client.registerAgent({
    agentId: input.worker.agentId,
    ownerSlackUserId: input.worker.ownerSlackUserId,
    displayName: input.worker.displayName,
    capabilities: input.worker.capabilities
  });
  await input.client.heartbeat(input.worker.agentId);

  const task = await input.client.claimTask({
    agentId: input.worker.agentId,
    leaseSeconds: input.worker.leaseSeconds
  });
  if (!task) {
    return { claimed: false };
  }

  try {
    const result = await input.executor(task);
    await input.client.updateTask(task.id, {
      status: "completed",
      resultSummary: boundText(result.resultSummary, DEFAULT_RESULT_SUMMARY_MAX_CHARS),
      agentId: input.worker.agentId
    });
    return {
      claimed: true,
      taskId: task.id,
      status: "completed"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await input.client.updateTask(task.id, {
      status: "failed",
      errorSummary: boundText(message, DEFAULT_ERROR_SUMMARY_MAX_CHARS),
      agentId: input.worker.agentId
    });
    return {
      claimed: true,
      taskId: task.id,
      status: "failed"
    };
  }
}

export function createLocalAgentTaskExecutor(input: {
  config: AppConfig;
  modelClient?: AgentModelClient;
  googleWorkspaceClient?: GoogleWorkspaceClient;
}): AgentTaskExecutor {
  return async (task) => {
    if (task.type !== "answer_question") {
      throw new Error(`Unsupported agent task type: ${task.type}`);
    }

    const question = task.input.question;
    if (typeof question !== "string" || question.trim() === "") {
      throw new Error("answer_question task input requires a non-empty question.");
    }

    const memoryStore = input.config.localMemory.enabled
      ? new LocalMemoryStore(input.config.localMemory.dbPath)
      : undefined;
    try {
      const watchedFolders = mergeUniquePaths(
        input.config.localFiles.watchedFolders,
        memoryStore?.listEnabledAllowedFolderPaths() ?? []
      );
      const config = {
        ...input.config,
        localFiles: {
          ...input.config.localFiles,
          watchedFolders
        }
      };
      const answer = await runAgentQuestion({
        question,
        source: "app_home_message",
        config,
        memoryStore,
        modelClient: input.modelClient,
        googleWorkspaceClient: input.googleWorkspaceClient
      });
      return {
        resultSummary: `tool calls=${answer.toolCallCount}\n${answer.answer}`
      };
    } finally {
      memoryStore?.close();
    }
  };
}

export function buildAgentWorkerConfig(env: Record<string, string | undefined> = process.env): AgentWorkerConfig {
  return {
    agentId: env.CENTER_AGENT_ID?.trim() || `${os.hostname()}-local-agent`,
    ownerSlackUserId: requireEnvValue(env.CENTER_AGENT_OWNER_SLACK_USER_ID, "CENTER_AGENT_OWNER_SLACK_USER_ID"),
    displayName: env.CENTER_AGENT_DISPLAY_NAME?.trim() || os.hostname(),
    leaseSeconds: parsePositiveInteger(env.CENTER_AGENT_LEASE_SECONDS, 60, "CENTER_AGENT_LEASE_SECONDS"),
    capabilities: ["answer_question"]
  };
}

export function getCenterServerUrl(env: Record<string, string | undefined> = process.env): string {
  return env.CENTER_SERVER_URL?.trim() || "http://127.0.0.1:4318";
}

function requireEnvValue(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required.`);
  }
  return trimmed;
}

function parsePositiveInteger(value: string | undefined, defaultValue: number, name: string): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function boundText(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars - 15)}...[truncated]` : value;
}

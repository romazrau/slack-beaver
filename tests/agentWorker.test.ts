import { describe, expect, it } from "vitest";
import type { AgentTask, RegisteredAgent } from "../src/center-db/agentTasks.js";
import { runAgentWorkerOnce, type AgentWorkerConfig } from "../src/agent/agentWorker.js";
import type { CenterAgentTaskClient, UpdateTaskRequest } from "../src/agent/centerTaskClient.js";

const worker: AgentWorkerConfig = {
  agentId: "local-1",
  ownerSlackUserId: "U_MIRA",
  displayName: "Mira laptop",
  leaseSeconds: 30,
  capabilities: ["answer_question"]
};

function buildTask(id = 1): AgentTask {
  return {
    id,
    type: "answer_question",
    status: "running",
    createdBy: "U_MIRA",
    targetOwner: "U_MIRA",
    input: { question: "What changed?" },
    resultSummary: null,
    errorSummary: null,
    claimedByAgentId: "local-1",
    claimExpiresAt: "2026-06-29T00:01:00.000Z",
    attemptCount: 1,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z"
  };
}

function buildAgent(): RegisteredAgent {
  return {
    agentId: "local-1",
    ownerSlackUserId: "U_MIRA",
    displayName: "Mira laptop",
    capabilities: ["answer_question"],
    status: "online",
    lastSeenAt: "2026-06-29T00:00:00.000Z",
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z"
  };
}

class FakeCenterAgentTaskClient implements CenterAgentTaskClient {
  updates: UpdateTaskRequest[] = [];

  constructor(private readonly task: AgentTask | null) {}

  async registerAgent(): Promise<RegisteredAgent> {
    return buildAgent();
  }

  async heartbeat(): Promise<RegisteredAgent> {
    return buildAgent();
  }

  async claimTask(): Promise<AgentTask | null> {
    return this.task;
  }

  async updateTask(_id: number, input: UpdateTaskRequest): Promise<AgentTask> {
    this.updates.push(input);
    return {
      ...(this.task ?? buildTask()),
      status: input.status,
      resultSummary: input.resultSummary ?? null,
      errorSummary: input.errorSummary ?? null
    };
  }
}

describe("runAgentWorkerOnce", () => {
  it("returns without executing when no task is claimable", async () => {
    const client = new FakeCenterAgentTaskClient(null);
    const result = await runAgentWorkerOnce({
      client,
      worker,
      async executor() {
        throw new Error("should not execute");
      }
    });

    expect(result).toEqual({ claimed: false });
    expect(client.updates).toEqual([]);
  });

  it("completes a claimed task", async () => {
    const client = new FakeCenterAgentTaskClient(buildTask());
    const result = await runAgentWorkerOnce({
      client,
      worker,
      async executor(task) {
        expect(task.input.question).toBe("What changed?");
        return { resultSummary: "Answer from local agent." };
      }
    });

    expect(result).toEqual({
      claimed: true,
      taskId: 1,
      status: "completed"
    });
    expect(client.updates).toEqual([
      {
        status: "completed",
        resultSummary: "Answer from local agent.",
        agentId: "local-1"
      }
    ]);
  });

  it("fails a claimed task with a bounded error summary", async () => {
    const client = new FakeCenterAgentTaskClient(buildTask());
    const result = await runAgentWorkerOnce({
      client,
      worker,
      async executor() {
        throw new Error("Local execution failed.");
      }
    });

    expect(result).toEqual({
      claimed: true,
      taskId: 1,
      status: "failed"
    });
    expect(client.updates).toEqual([
      {
        status: "failed",
        errorSummary: "Local execution failed.",
        agentId: "local-1"
      }
    ]);
  });
});

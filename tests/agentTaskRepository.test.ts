import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentTaskRepository, AgentTaskValidationError } from "../src/center-db/agentTasks.js";

let tempDir: string;
let repository: AgentTaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slack-beaver-agent-task-db-"));
  repository = new AgentTaskRepository(path.join(tempDir, "center.sqlite"));
});

afterEach(() => {
  repository.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("AgentTaskRepository", () => {
  it("registers agents, creates tasks, and claims one eligible task", () => {
    const agent = repository.registerAgent({
      agentId: "local-1",
      ownerSlackUserId: "U_MIRA",
      displayName: "Mira laptop",
      capabilities: ["answer_question"]
    });
    const task = repository.createTask({
      type: "answer_question",
      createdBy: "U_MIRA",
      targetOwner: "U_MIRA",
      input: { question: "What changed?" }
    });

    const claimed = repository.claimNextTask({
      agentId: agent.agentId,
      leaseSeconds: 30,
      now: new Date("2026-06-29T00:00:00.000Z")
    });

    expect(claimed).toMatchObject({
      id: task.id,
      status: "running",
      claimedByAgentId: "local-1",
      attemptCount: 1
    });
    expect(claimed?.claimExpiresAt).toBe("2026-06-29T00:00:30.000Z");
    expect(
      repository.claimNextTask({
        agentId: agent.agentId,
        now: new Date("2026-06-29T00:00:29.000Z")
      })
    ).toBeUndefined();
  });

  it("does not claim tasks for the wrong owner or unsupported capability", () => {
    repository.registerAgent({
      agentId: "local-1",
      ownerSlackUserId: "U_MIRA",
      capabilities: ["answer_question"]
    });
    repository.createTask({
      type: "answer_question",
      createdBy: "U_SAM",
      targetOwner: "U_SAM",
      input: { question: "What changed?" }
    });

    expect(repository.claimNextTask({ agentId: "local-1" })).toBeUndefined();
  });

  it("reclaims a running task after the claim lease expires", () => {
    repository.registerAgent({
      agentId: "local-1",
      ownerSlackUserId: "U_MIRA",
      capabilities: ["answer_question"]
    });
    repository.registerAgent({
      agentId: "local-2",
      ownerSlackUserId: "U_MIRA",
      capabilities: ["answer_question"]
    });
    repository.createTask({
      type: "answer_question",
      createdBy: "U_MIRA",
      input: { question: "What changed?" }
    });

    const first = repository.claimNextTask({
      agentId: "local-1",
      leaseSeconds: 10,
      now: new Date("2026-06-29T00:00:00.000Z")
    });
    const beforeExpiry = repository.claimNextTask({
      agentId: "local-2",
      now: new Date("2026-06-29T00:00:09.000Z")
    });
    const afterExpiry = repository.claimNextTask({
      agentId: "local-2",
      now: new Date("2026-06-29T00:00:11.000Z")
    });

    expect(first?.claimedByAgentId).toBe("local-1");
    expect(beforeExpiry).toBeUndefined();
    expect(afterExpiry).toMatchObject({
      id: first?.id,
      status: "running",
      claimedByAgentId: "local-2",
      attemptCount: 2
    });
  });

  it("completes and fails only running tasks claimed by the same agent", () => {
    repository.registerAgent({
      agentId: "local-1",
      ownerSlackUserId: "U_MIRA",
      capabilities: ["answer_question"]
    });
    const task = repository.createTask({
      type: "answer_question",
      createdBy: "U_MIRA",
      input: { question: "What changed?" }
    });

    expect(() =>
      repository.updateTask(task.id, {
        status: "completed",
        resultSummary: "Done",
        agentId: "local-1"
      })
    ).toThrow("Only running agent tasks can be completed or failed.");

    const claimed = repository.claimNextTask({ agentId: "local-1" })!;
    expect(() =>
      repository.updateTask(claimed.id, {
        status: "failed",
        errorSummary: "Wrong agent",
        agentId: "other"
      })
    ).toThrow("Only the claiming agent");

    const completed = repository.updateTask(claimed.id, {
      status: "completed",
      resultSummary: "Done",
      agentId: "local-1"
    });
    expect(completed).toMatchObject({
      status: "completed",
      resultSummary: "Done",
      claimedByAgentId: "local-1",
      claimExpiresAt: null
    });
    expect(() =>
      repository.updateTask(claimed.id, {
        status: "failed",
        errorSummary: "Too late",
        agentId: "local-1"
      })
    ).toThrow("Terminal agent tasks cannot be updated.");
  });

  it("rejects malformed agents and tasks", () => {
    expect(() =>
      repository.registerAgent({
        agentId: "",
        ownerSlackUserId: "U_MIRA",
        capabilities: ["answer_question"]
      })
    ).toThrow(AgentTaskValidationError);

    expect(() =>
      repository.createTask({
        type: "answer_question",
        createdBy: "U_MIRA",
        input: { question: "Valid", path: "/tmp/secret" }
      })
    ).toThrow("answer_question input only supports question.");
  });
});

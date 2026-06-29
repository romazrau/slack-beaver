import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentTaskRepository } from "../src/center-db/agentTasks.js";
import { CenterTaskRepository } from "../src/center-db/tasks.js";
import { handleCenterRequest } from "../src/center-server/httpServer.js";

let tempDir: string;
let repository: CenterTaskRepository;
let agentTaskRepository: AgentTaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slack-beaver-center-api-"));
  const dbPath = path.join(tempDir, "center.sqlite");
  repository = new CenterTaskRepository(dbPath);
  agentTaskRepository = new AgentTaskRepository(dbPath);
});

afterEach(() => {
  repository.close();
  agentTaskRepository.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("Center HTTP server", () => {
  it("reports health", async () => {
    const response = handleCenterRequest({ method: "GET", path: "/health" }, repository);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      service: "center-server"
    });
  });

  it("handles CORS preflight requests", () => {
    const response = handleCenterRequest({ method: "OPTIONS", path: "/tasks" }, repository);

    expect(response.statusCode).toBe(204);
    expect(response.body).toBeNull();
  });

  it("creates, lists, gets, and updates tasks", async () => {
    const createResponse = handleCenterRequest(
      {
        method: "POST",
        path: "/tasks",
        body: {
          title: "Follow up with Priya",
          description: "Confirm rollout owner",
          createdBy: "U_MIRA",
          primaryOwner: "U_PRIYA"
        }
      },
      repository
    );
    const created = createResponse.body as { task: { id: number } };

    expect(createResponse.statusCode).toBe(201);
    expect(created.task).toMatchObject({
      id: 1,
      title: "Follow up with Priya",
      status: "open",
      createdBy: "U_MIRA",
      primaryOwner: "U_PRIYA"
    });

    const listResponse = handleCenterRequest({ method: "GET", path: "/tasks" }, repository);
    const listed = listResponse.body as { tasks: unknown[] };
    expect(listResponse.statusCode).toBe(200);
    expect(listed.tasks).toHaveLength(1);

    const getResponse = handleCenterRequest(
      { method: "GET", path: `/tasks/${created.task.id}` },
      repository
    );
    const fetched = getResponse.body as { task: { id: number } };
    expect(getResponse.statusCode).toBe(200);
    expect(fetched.task.id).toBe(created.task.id);

    const updateResponse = handleCenterRequest(
      {
        method: "PATCH",
        path: `/tasks/${created.task.id}`,
        body: {
          status: "done",
          primaryOwner: "U_SAM"
        }
      },
      repository
    );
    const updated = updateResponse.body as { task: { id: number } };
    expect(updateResponse.statusCode).toBe(200);
    expect(updated.task).toMatchObject({
      id: created.task.id,
      status: "done",
      createdBy: "U_MIRA",
      primaryOwner: "U_SAM"
    });
  });

  it("rejects malformed input and reports missing tasks", async () => {
    const invalidCreate = handleCenterRequest(
      {
        method: "POST",
        path: "/tasks",
        body: {
          title: "",
          createdBy: "U_MIRA",
          primaryOwner: "U_PRIYA"
        },
      },
      repository
    );
    expect(invalidCreate).toEqual({
      statusCode: 400,
      body: { error: "title is required." }
    });

    const missingBody = handleCenterRequest({ method: "POST", path: "/tasks" }, repository);
    expect(missingBody).toEqual({
      statusCode: 400,
      body: { error: "JSON request body is required." }
    });

    const invalidUpdate = handleCenterRequest(
      { method: "PATCH", path: "/tasks/999", body: { status: "done" } },
      repository
    );
    expect(invalidUpdate.statusCode).toBe(404);

    const missing = handleCenterRequest({ method: "GET", path: "/tasks/999" }, repository);
    expect(missing.statusCode).toBe(404);
  });

  it("registers agents and handles agent task lifecycle", () => {
    const register = handleCenterRequest(
      {
        method: "POST",
        path: "/agents/register",
        body: {
          agentId: "local-1",
          ownerSlackUserId: "U_MIRA",
          displayName: "Mira laptop",
          capabilities: ["answer_question"]
        }
      },
      repository,
      agentTaskRepository
    );
    expect(register.statusCode).toBe(200);
    expect(register.body).toMatchObject({
      agent: {
        agentId: "local-1",
        ownerSlackUserId: "U_MIRA",
        status: "online"
      }
    });

    const heartbeat = handleCenterRequest(
      { method: "POST", path: "/agents/local-1/heartbeat", body: {} },
      repository,
      agentTaskRepository
    );
    expect(heartbeat.statusCode).toBe(200);

    const create = handleCenterRequest(
      {
        method: "POST",
        path: "/agent-tasks",
        body: {
          type: "answer_question",
          createdBy: "U_MIRA",
          targetOwner: "U_MIRA",
          input: {
            question: "What changed?"
          }
        }
      },
      repository,
      agentTaskRepository
    );
    expect(create.statusCode).toBe(201);
    const created = create.body as { task: { id: number } };

    const claim = handleCenterRequest(
      {
        method: "POST",
        path: "/agent-tasks/claim",
        body: {
          agentId: "local-1",
          leaseSeconds: 30
        }
      },
      repository,
      agentTaskRepository
    );
    expect(claim.statusCode).toBe(200);
    expect(claim.body).toMatchObject({
      task: {
        id: created.task.id,
        status: "running",
        claimedByAgentId: "local-1"
      }
    });

    const complete = handleCenterRequest(
      {
        method: "PATCH",
        path: `/agent-tasks/${created.task.id}`,
        body: {
          status: "completed",
          resultSummary: "Done",
          agentId: "local-1"
        }
      },
      repository,
      agentTaskRepository
    );
    expect(complete.statusCode).toBe(200);
    expect(complete.body).toMatchObject({
      task: {
        id: created.task.id,
        status: "completed",
        resultSummary: "Done"
      }
    });
  });

  it("rejects malformed agent task input and reports missing agents", () => {
    const missingAgent = handleCenterRequest(
      { method: "POST", path: "/agents/missing/heartbeat", body: {} },
      repository,
      agentTaskRepository
    );
    expect(missingAgent.statusCode).toBe(404);

    const invalidTask = handleCenterRequest(
      {
        method: "POST",
        path: "/agent-tasks",
        body: {
          type: "answer_question",
          createdBy: "U_MIRA",
          input: {
            question: "Valid",
            path: "/tmp/secret"
          }
        }
      },
      repository,
      agentTaskRepository
    );
    expect(invalidTask).toEqual({
      statusCode: 400,
      body: { error: "answer_question input only supports question." }
    });
  });
});

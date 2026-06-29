import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CenterTaskRepository } from "../src/center-db/tasks.js";
import { handleCenterRequest } from "../src/center-server/httpServer.js";

let tempDir: string;
let repository: CenterTaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slack-beaver-center-api-"));
  repository = new CenterTaskRepository(path.join(tempDir, "center.sqlite"));
});

afterEach(() => {
  repository.close();
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
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CenterTaskRepository, TaskValidationError } from "../src/center-db/tasks.js";

let tempDir: string;
let repository: CenterTaskRepository;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slack-beaver-center-db-"));
  repository = new CenterTaskRepository(path.join(tempDir, "center.sqlite"));
});

afterEach(() => {
  repository.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("CenterTaskRepository", () => {
  it("creates, lists, and gets tasks", () => {
    const task = repository.createTask({
      title: "Review launch checklist",
      description: "Confirm owner handoff",
      createdBy: "U_MIRA",
      primaryOwner: "U_PRIYA"
    });

    expect(task).toMatchObject({
      id: 1,
      title: "Review launch checklist",
      description: "Confirm owner handoff",
      status: "open",
      createdBy: "U_MIRA",
      primaryOwner: "U_PRIYA"
    });
    expect(task.createdAt).toBeTruthy();
    expect(task.updatedAt).toBeTruthy();

    expect(repository.listTasks()).toHaveLength(1);
    expect(repository.getTask(task.id)).toEqual(task);
  });

  it("updates mutable fields while preserving creator metadata", () => {
    const task = repository.createTask({
      title: "Draft rollout note",
      createdBy: "U_MIRA",
      primaryOwner: "U_SAM"
    });

    const updated = repository.updateTask(task.id, {
      title: "Publish rollout note",
      description: "Send to #team",
      status: "in_progress",
      primaryOwner: "U_PRIYA"
    });

    expect(updated).toMatchObject({
      id: task.id,
      title: "Publish rollout note",
      description: "Send to #team",
      status: "in_progress",
      createdBy: "U_MIRA",
      primaryOwner: "U_PRIYA",
      createdAt: task.createdAt
    });
    expect(updated?.updatedAt).toBeTruthy();
  });

  it("returns undefined for missing tasks", () => {
    expect(repository.getTask(999)).toBeUndefined();
    expect(repository.updateTask(999, { status: "done" })).toBeUndefined();
  });

  it("rejects invalid create input", () => {
    expect(() =>
      repository.createTask({
        title: " ",
        createdBy: "U_MIRA",
        primaryOwner: "U_PRIYA"
      })
    ).toThrow(TaskValidationError);

    expect(() =>
      repository.createTask({
        title: "Valid",
        createdBy: "",
        primaryOwner: "U_PRIYA"
      })
    ).toThrow("createdBy is required.");
  });

  it("rejects invalid updates", () => {
    const task = repository.createTask({
      title: "Review task",
      createdBy: "U_MIRA",
      primaryOwner: "U_PRIYA"
    });

    expect(() => repository.updateTask(task.id, { status: "blocked" as never })).toThrow(
      "status must be one of"
    );
    expect(() => repository.updateTask(task.id, {})).toThrow(
      "At least one mutable task field is required."
    );
  });
});

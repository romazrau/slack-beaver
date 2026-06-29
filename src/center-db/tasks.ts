import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const TASK_STATUSES = ["open", "in_progress", "done", "canceled"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type CenterTask = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdBy: string;
  primaryOwner: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  createdBy: string;
  primaryOwner: string;
  status?: TaskStatus;
};

export type UpdateTaskInput = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  primaryOwner?: string;
};

type TaskRow = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdBy: string;
  primaryOwner: string;
  createdAt: string;
  updatedAt: string;
};

type StoredTaskRow = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_by: string;
  primary_owner: string;
  created_at: string;
  updated_at: string;
};

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskValidationError";
  }
}

export class CenterTaskRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  createTask(input: CreateTaskInput): CenterTask {
    const normalized = normalizeCreateTaskInput(input);
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `insert into tasks
          (title, description, status, created_by, primary_owner, created_at, updated_at)
         values
          (@title, @description, @status, @createdBy, @primaryOwner, @createdAt, @updatedAt)`
      )
      .run({
        ...normalized,
        createdAt: now,
        updatedAt: now
      });

    return this.getTask(Number(result.lastInsertRowid))!;
  }

  listTasks(): CenterTask[] {
    const rows = this.db
      .prepare(
        `select id,
                title,
                description,
                status,
                created_by as createdBy,
                primary_owner as primaryOwner,
                created_at as createdAt,
                updated_at as updatedAt
         from tasks
         order by updated_at desc, id desc`
      )
      .all() as TaskRow[];

    return rows.map(mapTaskRow);
  }

  getTask(id: number): CenterTask | undefined {
    const taskId = normalizeTaskId(id);
    const row = this.db
      .prepare(
        `select id,
                title,
                description,
                status,
                created_by as createdBy,
                primary_owner as primaryOwner,
                created_at as createdAt,
                updated_at as updatedAt
         from tasks
         where id = ?`
      )
      .get(taskId) as TaskRow | undefined;

    return row ? mapTaskRow(row) : undefined;
  }

  updateTask(id: number, input: UpdateTaskInput): CenterTask | undefined {
    const taskId = normalizeTaskId(id);
    const existing = this.getTask(taskId);
    if (!existing) {
      return undefined;
    }

    const normalized = normalizeUpdateTaskInput(input);
    if (Object.keys(normalized).length === 0) {
      throw new TaskValidationError("At least one mutable task field is required.");
    }

    const next = {
      title: normalized.title ?? existing.title,
      description:
        Object.prototype.hasOwnProperty.call(normalized, "description")
          ? normalized.description
          : existing.description,
      status: normalized.status ?? existing.status,
      primaryOwner: normalized.primaryOwner ?? existing.primaryOwner,
      updatedAt: new Date().toISOString()
    };

    this.db
      .prepare(
        `update tasks
         set title = @title,
             description = @description,
             status = @status,
             primary_owner = @primaryOwner,
             updated_at = @updatedAt
         where id = @id`
      )
      .run({
        id: taskId,
        ...next
      });

    return this.getTask(taskId);
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists tasks (
        id integer primary key autoincrement,
        title text not null,
        description text,
        status text not null,
        created_by text not null,
        primary_owner text not null,
        created_at text not null,
        updated_at text not null,
        check (status in ('open', 'in_progress', 'done', 'canceled'))
      );

      create index if not exists idx_tasks_updated_at on tasks(updated_at desc);
      create index if not exists idx_tasks_primary_owner on tasks(primary_owner);
      create index if not exists idx_tasks_status on tasks(status);
    `);
  }
}

function normalizeCreateTaskInput(input: CreateTaskInput): Required<CreateTaskInput> {
  return {
    title: requireNonEmptyString(input.title, "title"),
    description: normalizeOptionalString(input.description),
    createdBy: requireNonEmptyString(input.createdBy, "createdBy"),
    primaryOwner: requireNonEmptyString(input.primaryOwner, "primaryOwner"),
    status: normalizeTaskStatus(input.status ?? "open")
  };
}

function normalizeUpdateTaskInput(input: UpdateTaskInput): UpdateTaskInput {
  const normalized: UpdateTaskInput = {};

  if (Object.prototype.hasOwnProperty.call(input, "title")) {
    normalized.title = requireNonEmptyString(input.title, "title");
  }
  if (Object.prototype.hasOwnProperty.call(input, "description")) {
    normalized.description = normalizeOptionalString(input.description);
  }
  if (Object.prototype.hasOwnProperty.call(input, "status")) {
    normalized.status = normalizeTaskStatus(input.status);
  }
  if (Object.prototype.hasOwnProperty.call(input, "primaryOwner")) {
    normalized.primaryOwner = requireNonEmptyString(input.primaryOwner, "primaryOwner");
  }

  return normalized;
}

function normalizeTaskStatus(value: unknown): TaskStatus {
  if (TASK_STATUSES.includes(value as TaskStatus)) {
    return value as TaskStatus;
  }
  throw new TaskValidationError(`status must be one of: ${TASK_STATUSES.join(", ")}.`);
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TaskValidationError(`${fieldName} is required.`);
  }
  return value.trim();
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new TaskValidationError("description must be a string.");
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeTaskId(id: unknown): number {
  const parsed = typeof id === "number" ? id : Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TaskValidationError("Task id must be a positive integer.");
  }
  return parsed;
}

function mapTaskRow(row: TaskRow | StoredTaskRow): CenterTask {
  if ("createdBy" in row) {
    return row;
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    primaryOwner: row.primary_owner,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

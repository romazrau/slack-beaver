import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const AGENT_STATUSES = ["online", "offline", "unknown"] as const;
export const AGENT_TASK_STATUSES = ["queued", "running", "completed", "failed", "canceled"] as const;
export const AGENT_TASK_TYPES = ["answer_question"] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type AgentTaskStatus = (typeof AGENT_TASK_STATUSES)[number];
export type AgentTaskType = (typeof AGENT_TASK_TYPES)[number];

export type RegisteredAgent = {
  agentId: string;
  ownerSlackUserId: string;
  displayName: string | null;
  capabilities: string[];
  status: AgentStatus;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentTask = {
  id: number;
  type: AgentTaskType;
  status: AgentTaskStatus;
  createdBy: string;
  targetOwner: string | null;
  input: Record<string, unknown>;
  resultSummary: string | null;
  errorSummary: string | null;
  claimedByAgentId: string | null;
  claimExpiresAt: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RegisterAgentInput = {
  agentId: string;
  ownerSlackUserId: string;
  displayName?: string | null;
  capabilities: string[];
};

export type CreateAgentTaskInput = {
  type: AgentTaskType;
  createdBy: string;
  targetOwner?: string | null;
  input: Record<string, unknown>;
};

export type ClaimAgentTaskInput = {
  agentId: string;
  leaseSeconds?: number;
  now?: Date;
};

export type UpdateAgentTaskInput = {
  status: "completed" | "failed" | "canceled";
  resultSummary?: string | null;
  errorSummary?: string | null;
  agentId?: string;
};

type AgentRow = {
  agent_id: string;
  owner_slack_user_id: string;
  display_name: string | null;
  capabilities_json: string;
  status: AgentStatus;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

type AgentTaskRow = {
  id: number;
  type: AgentTaskType;
  status: AgentTaskStatus;
  created_by: string;
  target_owner: string | null;
  input_json: string;
  result_summary: string | null;
  error_summary: string | null;
  claimed_by_agent_id: string | null;
  claim_expires_at: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
};

export class AgentTaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentTaskValidationError";
  }
}

export class AgentTaskRepository {
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

  registerAgent(input: RegisterAgentInput): RegisteredAgent {
    const normalized = normalizeRegisterAgentInput(input);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `insert into registered_agents
          (agent_id, owner_slack_user_id, display_name, capabilities_json, status, last_seen_at, created_at, updated_at)
         values
          (@agentId, @ownerSlackUserId, @displayName, @capabilitiesJson, 'online', @now, @now, @now)
         on conflict(agent_id) do update set
           owner_slack_user_id = excluded.owner_slack_user_id,
           display_name = excluded.display_name,
           capabilities_json = excluded.capabilities_json,
           status = 'online',
           last_seen_at = excluded.last_seen_at,
           updated_at = excluded.updated_at`
      )
      .run({
        agentId: normalized.agentId,
        ownerSlackUserId: normalized.ownerSlackUserId,
        displayName: normalized.displayName,
        capabilitiesJson: JSON.stringify(normalized.capabilities),
        now
      });

    return this.getAgent(normalized.agentId)!;
  }

  recordHeartbeat(agentId: string): RegisteredAgent | undefined {
    const normalizedAgentId = requireNonEmptyString(agentId, "agentId");
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `update registered_agents
         set status = 'online',
             last_seen_at = @now,
             updated_at = @now
         where agent_id = @agentId`
      )
      .run({ agentId: normalizedAgentId, now });

    return result.changes > 0 ? this.getAgent(normalizedAgentId) : undefined;
  }

  getAgent(agentId: string): RegisteredAgent | undefined {
    const normalizedAgentId = requireNonEmptyString(agentId, "agentId");
    const row = this.db
      .prepare("select * from registered_agents where agent_id = ?")
      .get(normalizedAgentId) as AgentRow | undefined;
    return row ? mapAgentRow(row) : undefined;
  }

  createTask(input: CreateAgentTaskInput): AgentTask {
    const normalized = normalizeCreateAgentTaskInput(input);
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `insert into agent_tasks
          (type, status, created_by, target_owner, input_json, result_summary, error_summary,
           claimed_by_agent_id, claim_expires_at, attempt_count, created_at, updated_at)
         values
          (@type, 'queued', @createdBy, @targetOwner, @inputJson, null, null, null, null, 0, @now, @now)`
      )
      .run({
        type: normalized.type,
        createdBy: normalized.createdBy,
        targetOwner: normalized.targetOwner,
        inputJson: JSON.stringify(normalized.input),
        now
      });

    return this.getTask(Number(result.lastInsertRowid))!;
  }

  listTasks(): AgentTask[] {
    const rows = this.db
      .prepare("select * from agent_tasks order by updated_at desc, id desc")
      .all() as AgentTaskRow[];
    return rows.map(mapAgentTaskRow);
  }

  getTask(id: number): AgentTask | undefined {
    const taskId = normalizePositiveInteger(id, "Task id");
    const row = this.db.prepare("select * from agent_tasks where id = ?").get(taskId) as
      | AgentTaskRow
      | undefined;
    return row ? mapAgentTaskRow(row) : undefined;
  }

  claimNextTask(input: ClaimAgentTaskInput): AgentTask | undefined {
    const agentId = requireNonEmptyString(input.agentId, "agentId");
    const leaseSeconds = normalizeLeaseSeconds(input.leaseSeconds ?? 60);
    const now = input.now ?? new Date();
    const nowIso = now.toISOString();
    const claimExpiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();

    const claim = this.db.transaction(() => {
      const agent = this.getAgent(agentId);
      if (!agent || agent.status !== "online") {
        throw new AgentTaskValidationError("Agent must be registered and online before claiming tasks.");
      }

      const rows = this.db
        .prepare(
          `select *
           from agent_tasks
           where status = 'queued'
              or (status = 'running' and claim_expires_at is not null and claim_expires_at <= @now)
           order by created_at asc, id asc`
        )
        .all({ now: nowIso }) as AgentTaskRow[];

      const task = rows.map(mapAgentTaskRow).find((candidate) => {
        const ownerMatches = candidate.targetOwner === null || candidate.targetOwner === agent.ownerSlackUserId;
        return ownerMatches && agent.capabilities.includes(candidate.type);
      });

      if (!task) {
        return undefined;
      }

      this.db
        .prepare(
          `update agent_tasks
           set status = 'running',
               claimed_by_agent_id = @agentId,
               claim_expires_at = @claimExpiresAt,
               attempt_count = attempt_count + 1,
               error_summary = null,
               updated_at = @now
           where id = @id
             and (
               status = 'queued'
               or (status = 'running' and claim_expires_at is not null and claim_expires_at <= @now)
             )`
        )
        .run({
          id: task.id,
          agentId,
          claimExpiresAt,
          now: nowIso
        });

      return this.getTask(task.id);
    });

    return claim();
  }

  updateTask(id: number, input: UpdateAgentTaskInput): AgentTask | undefined {
    const taskId = normalizePositiveInteger(id, "Task id");
    const normalized = normalizeUpdateAgentTaskInput(input);
    const existing = this.getTask(taskId);
    if (!existing) {
      return undefined;
    }

    if (["completed", "failed", "canceled"].includes(existing.status)) {
      throw new AgentTaskValidationError("Terminal agent tasks cannot be updated.");
    }

    if (normalized.agentId && existing.claimedByAgentId && normalized.agentId !== existing.claimedByAgentId) {
      throw new AgentTaskValidationError("Only the claiming agent can complete or fail the task.");
    }

    if ((normalized.status === "completed" || normalized.status === "failed") && existing.status !== "running") {
      throw new AgentTaskValidationError("Only running agent tasks can be completed or failed.");
    }

    if (normalized.status === "completed" && !normalized.resultSummary) {
      throw new AgentTaskValidationError("resultSummary is required when completing a task.");
    }

    if (normalized.status === "failed" && !normalized.errorSummary) {
      throw new AgentTaskValidationError("errorSummary is required when failing a task.");
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `update agent_tasks
         set status = @status,
             result_summary = @resultSummary,
             error_summary = @errorSummary,
             claim_expires_at = null,
             updated_at = @now
         where id = @id`
      )
      .run({
        id: taskId,
        status: normalized.status,
        resultSummary: normalized.resultSummary,
        errorSummary: normalized.errorSummary,
        now
      });

    return this.getTask(taskId);
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists registered_agents (
        agent_id text primary key,
        owner_slack_user_id text not null,
        display_name text,
        capabilities_json text not null,
        status text not null,
        last_seen_at text not null,
        created_at text not null,
        updated_at text not null,
        check (status in ('online', 'offline', 'unknown'))
      );

      create table if not exists agent_tasks (
        id integer primary key autoincrement,
        type text not null,
        status text not null,
        created_by text not null,
        target_owner text,
        input_json text not null,
        result_summary text,
        error_summary text,
        claimed_by_agent_id text,
        claim_expires_at text,
        attempt_count integer not null default 0,
        created_at text not null,
        updated_at text not null,
        check (type in ('answer_question')),
        check (status in ('queued', 'running', 'completed', 'failed', 'canceled'))
      );

      create index if not exists idx_agent_tasks_status on agent_tasks(status);
      create index if not exists idx_agent_tasks_claim_expires_at on agent_tasks(claim_expires_at);
      create index if not exists idx_agent_tasks_target_owner on agent_tasks(target_owner);
      create index if not exists idx_registered_agents_owner on registered_agents(owner_slack_user_id);
    `);
  }
}

function normalizeRegisterAgentInput(input: RegisterAgentInput): Required<RegisterAgentInput> {
  const capabilities = normalizeStringArray(input.capabilities, "capabilities");
  for (const capability of capabilities) {
    normalizeAgentTaskType(capability);
  }

  return {
    agentId: requireNonEmptyString(input.agentId, "agentId"),
    ownerSlackUserId: requireNonEmptyString(input.ownerSlackUserId, "ownerSlackUserId"),
    displayName: normalizeOptionalString(input.displayName),
    capabilities
  };
}

function normalizeCreateAgentTaskInput(input: CreateAgentTaskInput): Required<CreateAgentTaskInput> {
  if (!isRecord(input.input)) {
    throw new AgentTaskValidationError("input must be a JSON object.");
  }
  validateTaskInput(input.type, input.input);

  return {
    type: normalizeAgentTaskType(input.type),
    createdBy: requireNonEmptyString(input.createdBy, "createdBy"),
    targetOwner: normalizeOptionalString(input.targetOwner),
    input: input.input
  };
}

function validateTaskInput(type: unknown, input: Record<string, unknown>): void {
  const taskType = normalizeAgentTaskType(type);
  if (taskType === "answer_question") {
    const keys = Object.keys(input);
    if (keys.some((key) => key !== "question")) {
      throw new AgentTaskValidationError("answer_question input only supports question.");
    }
    requireNonEmptyString(input.question, "question");
  }
}

function normalizeUpdateAgentTaskInput(input: UpdateAgentTaskInput): Required<UpdateAgentTaskInput> {
  return {
    status: normalizeTerminalTaskStatus(input.status),
    resultSummary: normalizeBoundedOptionalString(input.resultSummary, "resultSummary", 4000),
    errorSummary: normalizeBoundedOptionalString(input.errorSummary, "errorSummary", 1000),
    agentId: input.agentId ? requireNonEmptyString(input.agentId, "agentId") : ""
  };
}

function normalizeAgentTaskType(value: unknown): AgentTaskType {
  if (AGENT_TASK_TYPES.includes(value as AgentTaskType)) {
    return value as AgentTaskType;
  }
  throw new AgentTaskValidationError(`type must be one of: ${AGENT_TASK_TYPES.join(", ")}.`);
}

function normalizeTerminalTaskStatus(value: unknown): "completed" | "failed" | "canceled" {
  if (value === "completed" || value === "failed" || value === "canceled") {
    return value;
  }
  throw new AgentTaskValidationError("status must be one of: completed, failed, canceled.");
}

function normalizeLeaseSeconds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 3600) {
    throw new AgentTaskValidationError("leaseSeconds must be an integer between 1 and 3600.");
  }
  return parsed;
}

function normalizePositiveInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AgentTaskValidationError(`${label} must be a positive integer.`);
  }
  return parsed;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AgentTaskValidationError(`${fieldName} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > 500) {
    throw new AgentTaskValidationError(`${fieldName} is too long.`);
  }
  return trimmed;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new AgentTaskValidationError("Optional string fields must be strings.");
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeBoundedOptionalString(value: unknown, fieldName: string, maxLength: number): string | null {
  const normalized = normalizeOptionalString(value);
  if (normalized !== null && normalized.length > maxLength) {
    throw new AgentTaskValidationError(`${fieldName} is too long.`);
  }
  return normalized;
}

function normalizeStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AgentTaskValidationError(`${fieldName} must be a non-empty array.`);
  }

  const values = value.map((item) => requireNonEmptyString(item, fieldName));
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapAgentRow(row: AgentRow): RegisteredAgent {
  const capabilities = JSON.parse(row.capabilities_json) as unknown;
  return {
    agentId: row.agent_id,
    ownerSlackUserId: row.owner_slack_user_id,
    displayName: row.display_name,
    capabilities: Array.isArray(capabilities) ? capabilities.filter((item): item is string => typeof item === "string") : [],
    status: row.status,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAgentTaskRow(row: AgentTaskRow): AgentTask {
  const input = JSON.parse(row.input_json) as unknown;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    createdBy: row.created_by,
    targetOwner: row.target_owner,
    input: isRecord(input) ? input : {},
    resultSummary: row.result_summary,
    errorSummary: row.error_summary,
    claimedByAgentId: row.claimed_by_agent_id,
    claimExpiresAt: row.claim_expires_at,
    attemptCount: row.attempt_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

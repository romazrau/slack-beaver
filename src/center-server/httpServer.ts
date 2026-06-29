import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  CenterTaskRepository,
  type CreateTaskInput,
  TaskValidationError,
  type UpdateTaskInput
} from "../center-db/tasks.js";

export type CenterHttpServerOptions = {
  repository: CenterTaskRepository;
};

export type CenterRequestInput = {
  method: string;
  path: string;
  body?: JsonRecord;
};

export type CenterResponseOutput = {
  statusCode: number;
  body: unknown;
};

type JsonRecord = Record<string, unknown>;

const MAX_BODY_BYTES = 64 * 1024;

export function createCenterHttpServer(options: CenterHttpServerOptions): http.Server {
  return http.createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://localhost");
      const body = method === "POST" || method === "PATCH" ? await readJsonBody(request) : undefined;
      const result = handleCenterRequest(
        {
          method,
          path: url.pathname,
          body
        },
        options.repository
      );
      sendJson(response, result.statusCode, result.body);
    } catch (error) {
      if (error instanceof TaskValidationError || error instanceof RequestValidationError) {
        sendJson(response, 400, { error: error.message });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, 500, { error: "Internal server error.", detail: message });
    }
  });
}

export function handleCenterRequest(
  input: CenterRequestInput,
  repository: CenterTaskRepository
): CenterResponseOutput {
  try {
    return handleValidatedCenterRequest(input, repository);
  } catch (error) {
    if (error instanceof TaskValidationError || error instanceof RequestValidationError) {
      return { statusCode: 400, body: { error: error.message } };
    }
    throw error;
  }
}

function handleValidatedCenterRequest(
  input: CenterRequestInput,
  repository: CenterTaskRepository
): CenterResponseOutput {
  const method = input.method;
  const pathname = input.path;

  if (method === "GET" && pathname === "/health") {
    return { statusCode: 200, body: { ok: true, service: "center-server" } };
  }

  if (method === "OPTIONS") {
    return { statusCode: 204, body: null };
  }

  if (method === "GET" && pathname === "/tasks") {
    return { statusCode: 200, body: { tasks: repository.listTasks() } };
  }

  if (method === "POST" && pathname === "/tasks") {
    const body = requireJsonObject(input.body);
    const task = repository.createTask(toCreateTaskInput(body));
    return { statusCode: 201, body: { task } };
  }

  const taskMatch = pathname.match(/^\/tasks\/(\d+)$/);
  if (taskMatch) {
    const id = Number(taskMatch[1]);

    if (method === "GET") {
      const task = repository.getTask(id);
      if (!task) {
        return { statusCode: 404, body: { error: "Task not found." } };
      }
      return { statusCode: 200, body: { task } };
    }

    if (method === "PATCH") {
      const body = requireJsonObject(input.body);
      const task = repository.updateTask(id, toUpdateTaskInput(body));
      if (!task) {
        return { statusCode: 404, body: { error: "Task not found." } };
      }
      return { statusCode: 200, body: { task } };
    }
  }

  return { statusCode: 404, body: { error: "Not found." } };
}

function toCreateTaskInput(body: JsonRecord): CreateTaskInput {
  return {
    title: body.title as string,
    description: body.description as string | null | undefined,
    createdBy: body.createdBy as string,
    primaryOwner: body.primaryOwner as string,
    status: body.status as CreateTaskInput["status"]
  };
}

function toUpdateTaskInput(body: JsonRecord): UpdateTaskInput {
  const input: UpdateTaskInput = {};
  for (const key of ["title", "description", "status", "primaryOwner"] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      input[key] = body[key] as never;
    }
  }
  return input;
}

async function readJsonBody(request: IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      throw new RequestValidationError("Request body is too large.");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    throw new RequestValidationError("JSON request body is required.");
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RequestValidationError("Request body must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestValidationError("Request body must be a JSON object.");
  }

  return parsed as JsonRecord;
}

function requireJsonObject(body: JsonRecord | undefined): JsonRecord {
  if (!body) {
    throw new RequestValidationError("JSON request body is required.");
  }
  return body;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const payload = body === null ? "" : JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end(payload);
}

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

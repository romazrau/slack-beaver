import type { AgentCommandSource } from "./agentCommands.js";
import type { AppConfig } from "../config/config.js";
import { LocalMemoryStore } from "../memory/localMemory.js";
import { searchLocalFiles, type SearchResult } from "../search/localSearch.js";

export type ToolExecutionContext = {
  source: AgentCommandSource;
  config: AppConfig;
  memoryStore?: LocalMemoryStore;
};

export async function runLocalSearchTool(
  query: string,
  context: ToolExecutionContext
): Promise<SearchResult[]> {
  const results = await searchLocalFiles(query, context.config.localFiles);
  context.memoryStore?.recordToolCall({
    source: context.source,
    toolName: "local_search",
    inputSummary: `query length=${query.length}`,
    outputSummary: `result count=${results.length}`,
    status: "success"
  });
  return results;
}

export type RegisteredToolName = "local_search";

export type AgentToolCallRequest = {
  id: string;
  name: string;
  input: unknown;
};

export type AgentToolCallResult = {
  callId: string;
  name: RegisteredToolName;
  output: string;
  resultCount: number;
};

const REGISTERED_TOOL_METADATA = [
  {
    name: "local_search" as const,
    description:
      "Search read-only allowlisted local text files for a query. Does not accept paths or shell commands.",
    catalogLine:
      "local_search({ query: string }): Search read-only allowlisted local text files. Hard limits: no path input, no shell command, no token access, no file mutation, no denied folders, no non-registered fields."
  }
];

export function listAgentToolDefinitions() {
  return REGISTERED_TOOL_METADATA.map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "The search query. Must be non-empty."
          }
        },
        required: ["query"]
      }
    }));
}

export function buildAgentReadableToolCatalog(): string {
  return REGISTERED_TOOL_METADATA.map((tool) => `- ${tool.catalogLine}`).join("\n");
}

export async function runAgentToolCall(
  request: AgentToolCallRequest,
  context: ToolExecutionContext
): Promise<AgentToolCallResult> {
  if (request.name !== "local_search") {
    recordRejectedToolCall(request, context, "unknown tool");
    throw new Error(`Rejected unknown tool: ${request.name}`);
  }

  const input = parseLocalSearchInput(request.input);
  if (!input.ok) {
    recordRejectedToolCall(request, context, input.reason);
    throw new Error(`Rejected local_search tool input: ${input.reason}`);
  }

  const results = await runLocalSearchTool(input.query, context);
  return {
    callId: request.id,
    name: "local_search",
    output: JSON.stringify({
      results: results.map((result) => ({
        filename: result.filename,
        path: result.path,
        matchType: result.matchType,
        snippet: result.snippet
      }))
    }),
    resultCount: results.length
  };
}

function parseLocalSearchInput(input: unknown): { ok: true; query: string } | { ok: false; reason: string } {
  if (!isRecord(input)) {
    return { ok: false, reason: "input must be an object" };
  }

  const allowedKeys = new Set(["query"]);
  const unexpected = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    return { ok: false, reason: `unexpected fields: ${unexpected.join(", ")}` };
  }

  if (typeof input.query !== "string" || input.query.trim() === "") {
    return { ok: false, reason: "query must be a non-empty string" };
  }

  const query = input.query.trim();
  if (containsPathLikeInput(query)) {
    return { ok: false, reason: "query must not contain filesystem paths" };
  }

  return { ok: true, query };
}

function containsPathLikeInput(value: string): boolean {
  return /(^|\s)(~\/|[A-Za-z]:\\|\.\.\/|\/(?:Users|private|tmp|var|etc|home|opt|Volumes|Applications|Library)\b|\/\S+\/\S+)/.test(
    value
  );
}

function recordRejectedToolCall(
  request: AgentToolCallRequest,
  context: ToolExecutionContext,
  reason: string
): void {
  context.memoryStore?.recordToolCall({
    source: context.source,
    toolName: request.name,
    inputSummary: "rejected model-requested tool call",
    status: "rejected",
    errorSummary: reason
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

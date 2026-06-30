import path from "node:path";
import type { AgentPlan, AgentPlanReadStep, AgentPlanSearchStep } from "./agentPlan.js";
import {
  runAgentToolCall,
  type AgentToolCallRequest,
  type AgentToolCallResult,
  type ToolExecutionContext
} from "./toolRegistry.js";

export type ExecuteAgentPlanOptions = {
  plan: AgentPlan;
  context: ToolExecutionContext;
  onToolCallStart?: (toolCall: AgentToolCallRequest) => Promise<void>;
  onToolCallResult?: (result: AgentToolCallResult) => Promise<void>;
  onToolCallError?: (toolCall: AgentToolCallRequest, error: unknown) => Promise<void>;
};

export async function executeAgentPlan(input: ExecuteAgentPlanOptions): Promise<AgentToolCallResult[]> {
  const outputs: AgentToolCallResult[] = [];
  const searchOutputs: Array<AgentToolCallResult | undefined> = [];

  for (const [index, search] of input.plan.searches.entries()) {
    const toolCall = buildSearchToolCall(search, index);
    await input.onToolCallStart?.(toolCall);
    const result = await runPlanToolCall(input, toolCall);
    await input.onToolCallResult?.(result);
    outputs.push(result);
    searchOutputs[index] = result;
  }

  for (const [index, read] of input.plan.reads.entries()) {
    const searchOutput = searchOutputs[read.fromSearchIndex];
    if (!searchOutput || searchOutput.resultCount === 0) {
      continue;
    }
    const readInput = buildReadInput(read, searchOutput, input.plan.searches[read.fromSearchIndex]);
    if (!readInput) {
      continue;
    }
    const toolCall: AgentToolCallRequest = {
      id: `plan_read_${index + 1}`,
      name: read.tool,
      input: readInput
    };
    await input.onToolCallStart?.(toolCall);
    const result = await runPlanToolCall(input, toolCall);
    await input.onToolCallResult?.(result);
    outputs.push(result);
  }

  return outputs;
}

async function runPlanToolCall(
  input: ExecuteAgentPlanOptions,
  toolCall: AgentToolCallRequest
): Promise<AgentToolCallResult> {
  try {
    return await runAgentToolCall(toolCall, input.context);
  } catch (error) {
    await input.onToolCallError?.(toolCall, error);
    throw error;
  }
}

function buildSearchToolCall(search: AgentPlanSearchStep, index: number): AgentToolCallRequest {
  return {
    id: `plan_search_${index + 1}`,
    name: search.tool,
    input: { query: search.query }
  };
}

function buildReadInput(
  read: AgentPlanReadStep,
  searchOutput: AgentToolCallResult,
  search?: AgentPlanSearchStep
): unknown | undefined {
  const firstResult = preferredSearchResult(searchOutput.output, search?.query);
  if (!firstResult) {
    return undefined;
  }
  if (read.tool === "local_file_read") {
    const path = firstString(firstResult.path);
    return path ? { path } : undefined;
  }
  if (read.tool === "gmail_read_message") {
    const messageId = firstString(firstResult.messageId);
    return messageId ? { messageId } : undefined;
  }
  const documentId = firstString(firstResult.documentId);
  return documentId ? { documentId } : undefined;
}

function preferredSearchResult(output: string, query?: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(output) as { results?: unknown };
    if (!Array.isArray(parsed.results)) {
      return undefined;
    }
    const results = parsed.results.filter(
      (result): result is Record<string, unknown> => Boolean(result) && typeof result === "object" && !Array.isArray(result)
    );
    return results.sort((left, right) => scoreSearchResult(right, query) - scoreSearchResult(left, query))[0];
  } catch {
    return undefined;
  }
}

function scoreSearchResult(result: Record<string, unknown>, query?: string): number {
  const filename = firstString(result.filename) ?? firstString(result.name) ?? "";
  const locator = firstString(result.path) ?? firstString(result.documentId) ?? firstString(result.messageId) ?? "";
  const snippet = firstString(result.snippet) ?? "";
  const normalizedFilename = filename.toLowerCase();
  const normalizedLocator = locator.toLowerCase();
  const normalizedText = `${normalizedFilename} ${normalizedLocator} ${snippet.toLowerCase()}`;
  let score = 0;

  for (const term of queryTerms(query)) {
    if (normalizedFilename.includes(term)) {
      score += 4;
    }
    if (normalizedText.includes(term)) {
      score += 1;
    }
  }

  if (isLikelyContentPath(normalizedLocator)) {
    score += 5;
  }
  if (normalizedFilename && !isIndexLikeFilename(normalizedFilename)) {
    score += 2;
  }
  if (isIndexLikeFilename(normalizedFilename)) {
    score -= 8;
  }
  if (isPlanningOrRunbookPath(normalizedLocator) && !queryTargetsPlanningOrRunbookPath(query, normalizedLocator)) {
    score -= 6;
  }

  return score;
}

function queryTerms(query?: string): string[] {
  if (!query) {
    return [];
  }
  return query
    .toLowerCase()
    .split(/[^a-z0-9\u3400-\u9fff]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 || /[\u3400-\u9fff]/u.test(term));
}

function isIndexLikeFilename(filename: string): boolean {
  return filename === "readme.md" || filename === "index.md" || filename.endsWith("-index.json");
}

function isPlanningOrRunbookPath(locator: string): boolean {
  const segments = locator.split(/[\\/]+/).filter(Boolean);
  return segments.some((segment, index) => {
    if (segment === "repo-goal" || segment === "runbooks") {
      return true;
    }
    if (segment !== "docs") {
      return false;
    }
    const next = segments[index + 1];
    return next === "memory" || next === "repo-goal" || next === "runbooks";
  });
}

function queryTargetsPlanningOrRunbookPath(query: string | undefined, locator: string): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) {
    return false;
  }

  const basenameTerms = queryTerms(path.basename(locator));
  const planningSegments = new Set(["docs", "memory", "repo", "goal", "repo-goal", "runbook", "runbooks"]);
  return terms.some((term) => planningSegments.has(term) || basenameTerms.includes(term));
}

function isLikelyContentPath(locator: string): boolean {
  const segments = locator.split(/[\\/]+/).filter(Boolean);
  const basename = path.basename(locator);
  return (
    segments.includes("doc-test") ||
    segments.includes("literature") ||
    segments.includes("quotes") ||
    segments.includes("prose") ||
    segments.includes("poetry") ||
    /station|umbrella|dispatch|rollout|week|passage|quote|excerpt/.test(basename)
  );
}

function firstString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

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
};

export async function executeAgentPlan(input: ExecuteAgentPlanOptions): Promise<AgentToolCallResult[]> {
  const outputs: AgentToolCallResult[] = [];
  const searchOutputs: Array<AgentToolCallResult | undefined> = [];

  for (const [index, search] of input.plan.searches.entries()) {
    const toolCall = buildSearchToolCall(search, index);
    await input.onToolCallStart?.(toolCall);
    const result = await runAgentToolCall(toolCall, input.context);
    await input.onToolCallResult?.(result);
    outputs.push(result);
    searchOutputs[index] = result;
  }

  for (const [index, read] of input.plan.reads.entries()) {
    const searchOutput = searchOutputs[read.fromSearchIndex];
    if (!searchOutput || searchOutput.resultCount === 0) {
      continue;
    }
    const readInput = buildReadInput(read, searchOutput);
    if (!readInput) {
      continue;
    }
    const toolCall: AgentToolCallRequest = {
      id: `plan_read_${index + 1}`,
      name: read.tool,
      input: readInput
    };
    await input.onToolCallStart?.(toolCall);
    const result = await runAgentToolCall(toolCall, input.context);
    await input.onToolCallResult?.(result);
    outputs.push(result);
  }

  return outputs;
}

function buildSearchToolCall(search: AgentPlanSearchStep, index: number): AgentToolCallRequest {
  return {
    id: `plan_search_${index + 1}`,
    name: search.tool,
    input: { query: search.query }
  };
}

function buildReadInput(read: AgentPlanReadStep, searchOutput: AgentToolCallResult): unknown | undefined {
  const firstResult = firstSearchResult(searchOutput.output);
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

function firstSearchResult(output: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(output) as { results?: unknown };
    if (!Array.isArray(parsed.results)) {
      return undefined;
    }
    const first = parsed.results.find((result) => result && typeof result === "object" && !Array.isArray(result));
    return first as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

function firstString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

import type { AgentToolCallResult } from "./toolRegistry.js";

export const AGENT_WORKFLOW_TASK_KINDS = [
  "retrieve_answer",
  "write_file",
  "edit_file",
  "summarize_source",
  "organize_research",
  "remote_task"
] as const;

export type AgentWorkflowTaskKind = (typeof AGENT_WORKFLOW_TASK_KINDS)[number];

export const AGENT_WORKFLOW_STATUSES = [
  "intake",
  "planning",
  "searching",
  "candidates_found",
  "needs_user_choice",
  "reading_context",
  "drafting",
  "reviewing",
  "ready_to_answer",
  "ready_to_act",
  "awaiting_confirmation",
  "executing_action",
  "completed",
  "stopped_with_summary",
  "failed"
] as const;

export type AgentWorkflowStatus = (typeof AGENT_WORKFLOW_STATUSES)[number];

export type AgentWorkflowState = {
  workflowId: string;
  taskKind: AgentWorkflowTaskKind;
  status: AgentWorkflowStatus;
  userGoal: string;
  constraints: readonly string[];
  sourcesSearched: readonly string[];
  candidateSources: readonly string[];
  selectedCandidateIds: readonly string[];
  evidenceSummary: string;
  stopReason: string;
  nextUserActions: readonly string[];
  pendingAction: string | null;
};

export type BuildAgentWorkflowStateInput = {
  workflowId: string;
  taskKind: AgentWorkflowTaskKind;
  status: AgentWorkflowStatus;
  userGoal: string;
  constraints?: readonly string[];
  sourcesSearched?: readonly string[];
  candidateSources?: readonly string[];
  selectedCandidateIds?: readonly string[];
  evidenceSummary?: string;
  stopReason?: string;
  nextUserActions?: readonly string[];
  pendingAction?: string | null;
};

export function buildAgentWorkflowState(input: BuildAgentWorkflowStateInput): AgentWorkflowState {
  return {
    workflowId: input.workflowId,
    taskKind: input.taskKind,
    status: input.status,
    userGoal: input.userGoal,
    constraints: input.constraints ?? [],
    sourcesSearched: input.sourcesSearched ?? [],
    candidateSources: input.candidateSources ?? [],
    selectedCandidateIds: input.selectedCandidateIds ?? [],
    evidenceSummary: input.evidenceSummary ?? "",
    stopReason: input.stopReason ?? "",
    nextUserActions: input.nextUserActions ?? [],
    pendingAction: input.pendingAction ?? null
  };
}

export function buildRetrievalWorkflowState(input: {
  workflowId: string;
  status: AgentWorkflowStatus;
  userGoal: string;
  toolOutputs?: readonly AgentToolCallResult[];
  constraints?: readonly string[];
  stopReason?: string;
  nextUserActions?: readonly string[];
}): AgentWorkflowState {
  const toolOutputs = input.toolOutputs ?? [];
  return buildAgentWorkflowState({
    workflowId: input.workflowId,
    taskKind: "retrieve_answer",
    status: input.status,
    userGoal: input.userGoal,
    constraints: input.constraints,
    sourcesSearched: summarizeSourcesSearched(toolOutputs),
    candidateSources: summarizeCandidateSources(toolOutputs, 3),
    selectedCandidateIds: summarizeSelectedCandidateIds(toolOutputs),
    evidenceSummary: summarizeEvidence(toolOutputs),
    stopReason: input.stopReason,
    nextUserActions: input.nextUserActions
  });
}

export function buildPendingMutationWorkflowState(input: {
  workflowId: string;
  taskKind: "write_file" | "edit_file";
  userGoal: string;
  pendingAction: string;
  constraints?: readonly string[];
  nextUserActions?: readonly string[];
}): AgentWorkflowState {
  return buildAgentWorkflowState({
    workflowId: input.workflowId,
    taskKind: input.taskKind,
    status: "awaiting_confirmation",
    userGoal: input.userGoal,
    constraints: input.constraints,
    pendingAction: input.pendingAction,
    nextUserActions: input.nextUserActions ?? ["Confirm the proposed file action before execution."]
  });
}

function summarizeSourcesSearched(toolOutputs: readonly AgentToolCallResult[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const output of toolOutputs) {
    if (!isSearchTool(output.name)) {
      continue;
    }
    const source = sourceLabelForTool(output.name);
    if (!source) {
      continue;
    }
    counts.set(source, (counts.get(source) ?? 0) + output.resultCount);
  }
  return Array.from(counts.entries()).map(([source, count]) => `${source} (${count} result(s))`);
}

function summarizeCandidateSources(
  toolOutputs: readonly AgentToolCallResult[],
  limit: number
): readonly string[] {
  const candidates: string[] = [];
  for (const output of toolOutputs) {
    if (!isSearchTool(output.name) || output.resultCount <= 0) {
      continue;
    }
    for (const candidate of extractCandidateSummaries(output)) {
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }
  return candidates;
}

function summarizeSelectedCandidateIds(toolOutputs: readonly AgentToolCallResult[]): readonly string[] {
  const ids: string[] = [];
  for (const output of toolOutputs) {
    if (!isReadTool(output.name) || output.resultCount <= 0) {
      continue;
    }
    const id = extractReadTarget(output);
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function summarizeEvidence(toolOutputs: readonly AgentToolCallResult[]): string {
  const positiveOutputs = toolOutputs.filter((output) => output.resultCount > 0);
  if (positiveOutputs.length === 0) {
    return "No configured-source evidence was found.";
  }
  return `${positiveOutputs.length} tool result(s) returned configured-source evidence.`;
}

function extractCandidateSummaries(output: AgentToolCallResult): readonly string[] {
  const source = sourceLabelForTool(output.name);
  if (!source) {
    return [];
  }
  const parsed = parseOutputObject(output.output);
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  const summaries: string[] = [];
  for (const result of results) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      continue;
    }
    const fields = result as Record<string, unknown>;
    const title = firstString(fields.title, fields.name, fields.subject, fields.path, fields.documentId, fields.messageId);
    if (title) {
      summaries.push(`${source}: ${title}`);
    }
  }
  if (summaries.length > 0) {
    return summaries;
  }
  return [`${source}: ${output.resultCount} result(s)`];
}

function extractReadTarget(output: AgentToolCallResult): string | undefined {
  const parsed = parseOutputObject(output.output);
  if (!parsed) {
    return undefined;
  }
  if (output.name === "local_file_read") {
    return firstString(asRecord(parsed.file)?.path, parsed.path);
  }
  if (output.name === "gmail_read_message") {
    return firstString(asRecord(parsed.message)?.messageId, parsed.messageId);
  }
  if (output.name === "google_drive_file_read" || output.name === "google_doc_read") {
    return firstString(asRecord(parsed.document)?.documentId, parsed.documentId);
  }
  return firstString(parsed.path, parsed.messageId, parsed.documentId, parsed.title, parsed.subject);
}

function parseOutputObject(output: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function firstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function sourceLabelForTool(toolName: string): string | undefined {
  if (toolName === "local_search" || toolName === "local_file_read") {
    return "local_files";
  }
  if (toolName === "gmail_search" || toolName === "gmail_read_message") {
    return "gmail";
  }
  if (toolName === "google_drive_search" || toolName === "google_drive_file_read" || toolName === "google_doc_read") {
    return "google_drive";
  }
  return undefined;
}

function isReadTool(toolName: string): boolean {
  return toolName === "local_file_read" || toolName === "gmail_read_message" || toolName === "google_drive_file_read" || toolName === "google_doc_read";
}

function isSearchTool(toolName: string): boolean {
  return toolName === "local_search" || toolName === "gmail_search" || toolName === "google_drive_search";
}

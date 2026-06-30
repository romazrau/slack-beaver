import type { RegisteredToolName } from "./toolRegistry.js";
import type { RetrievalBudgetMode } from "./retrievalBudget.js";

export type AgentPlanSource = "local_files" | "gmail" | "google_docs";
type PlannerSourceInput = AgentPlanSource | "google_drive";

export type AgentPlanSearchStep = {
  tool: Extract<RegisteredToolName, "local_search" | "gmail_search" | "google_drive_search">;
  query: string;
};

export type AgentPlanReadStep = {
  tool: Extract<RegisteredToolName, "local_file_read" | "gmail_read_message" | "google_doc_read" | "google_drive_file_read">;
  fromSearchIndex: number;
};

export type AgentReadPolicy = {
  maxReads: number;
  reason?: string;
};

export type AgentPlan = {
  intent: "answer_from_sources" | "ask_user" | "answer_without_tools" | "insufficient_context";
  requiresClarification: boolean;
  clarifyingQuestion?: string;
  sources: AgentPlanSource[];
  searches: AgentPlanSearchStep[];
  reads: AgentPlanReadStep[];
  readPolicy: AgentReadPolicy;
  budgetHint?: RetrievalBudgetMode;
  budgetReason?: string;
};

const SEARCH_TO_READ_TOOL: Record<AgentPlanSearchStep["tool"], AgentPlanReadStep["tool"] | undefined> = {
  local_search: "local_file_read",
  gmail_search: "gmail_read_message",
  google_drive_search: "google_drive_file_read"
};
const MAX_PLAN_SOURCES = 3;
const MAX_PLAN_SEARCHES = 5;

export function parseAgentPlan(value: string | undefined): { ok: true; plan: AgentPlan } | { ok: false; reason: string } {
  if (!value?.trim()) {
    return { ok: false, reason: "planner returned no text" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { ok: false, reason: "planner output was not JSON" };
  }

  return validateAgentPlan(parsed);
}

export function validateAgentPlan(value: unknown): { ok: true; plan: AgentPlan } | { ok: false; reason: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: "plan must be an object" };
  }

  const allowedKeys = new Set([
    "intent",
    "requiresClarification",
    "clarifyingQuestion",
    "sources",
    "searches",
    "reads",
    "readPolicy",
    "budgetHint",
    "budgetReason"
  ]);
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    return { ok: false, reason: `unexpected plan fields: ${unexpected.join(", ")}` };
  }

  if (
    value.intent !== "answer_from_sources" &&
    value.intent !== "ask_user" &&
    value.intent !== "answer_without_tools" &&
    value.intent !== "insufficient_context"
  ) {
    return { ok: false, reason: "unsupported intent" };
  }

  if (typeof value.requiresClarification !== "boolean") {
    return { ok: false, reason: "requiresClarification must be boolean" };
  }

  const clarifyingQuestion =
    typeof value.clarifyingQuestion === "string" && value.clarifyingQuestion.trim()
      ? value.clarifyingQuestion.trim()
      : undefined;

  const sources = parseSources(value.sources);
  if (!sources.ok) {
    return sources;
  }

  const searchParse = parseSearches(value.searches);
  if (!searchParse.ok) {
    return searchParse;
  }

  const readPolicy = parseReadPolicy(value.readPolicy);
  if (!readPolicy.ok) {
    return readPolicy;
  }

  const reads = parseReads(value.reads, searchParse.searches, readPolicy.readPolicy.maxReads);
  if (!reads.ok) {
    return reads;
  }
  const budgetHint = parseBudgetHint(value.budgetHint);
  const budgetReason =
    typeof value.budgetReason === "string" && value.budgetReason.trim()
      ? value.budgetReason.trim().slice(0, 300)
      : undefined;

  if ((value.requiresClarification || value.intent === "ask_user") && !clarifyingQuestion) {
    return { ok: false, reason: "clarifyingQuestion is required for clarification plans" };
  }

  if (value.intent === "answer_from_sources" && searchParse.searches.steps.length === 0) {
    return { ok: false, reason: "answer_from_sources requires at least one search" };
  }

  return {
    ok: true,
    plan: {
      intent: value.intent,
      requiresClarification: value.requiresClarification,
      clarifyingQuestion,
      sources: sources.sources,
      searches: searchParse.searches.steps,
      reads: reads.reads,
      readPolicy: readPolicy.readPolicy,
      budgetHint,
      budgetReason
    }
  };
}

function parseSources(value: unknown): { ok: true; sources: AgentPlanSource[] } | { ok: false; reason: string } {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "sources must be an array" };
  }
  const sources: AgentPlanSource[] = [];
  for (const item of value) {
    if (item !== "local_files" && item !== "gmail" && item !== "google_docs" && item !== "google_drive") {
      return { ok: false, reason: "sources contains unsupported value" };
    }
    const normalized = normalizeSource(item);
    if (!sources.includes(normalized) && sources.length < MAX_PLAN_SOURCES) {
      sources.push(normalized);
    }
  }
  return { ok: true, sources };
}

function normalizeSource(value: PlannerSourceInput): AgentPlanSource {
  return value === "google_drive" ? "google_docs" : value;
}

function parseBudgetHint(value: unknown): RetrievalBudgetMode | undefined {
  if (value === "normal" || value === "expanded_single_document") {
    return value;
  }
  return undefined;
}

type ParsedSearches = {
  steps: AgentPlanSearchStep[];
  originalIndexToSearchIndex: Array<number | undefined>;
};

function parseSearches(value: unknown): { ok: true; searches: ParsedSearches } | { ok: false; reason: string } {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "searches must be an array" };
  }

  const searches: AgentPlanSearchStep[] = [];
  const originalIndexToSearchIndex: Array<number | undefined> = [];
  for (const [originalIndex, item] of value.entries()) {
    if (!isRecord(item)) {
      return { ok: false, reason: "search step must be an object" };
    }
    const unexpected = Object.keys(item).filter((key) => key !== "tool" && key !== "query");
    if (unexpected.length > 0) {
      return { ok: false, reason: `unexpected search fields: ${unexpected.join(", ")}` };
    }
    if (item.tool !== "local_search" && item.tool !== "gmail_search" && item.tool !== "google_drive_search") {
      return { ok: false, reason: "unsupported search tool" };
    }
    if (typeof item.query !== "string" || item.query.trim() === "") {
      return { ok: false, reason: "search query must be non-empty" };
    }
    const query = item.query.trim();
    if (query.length > 500) {
      return { ok: false, reason: "search query is too long" };
    }

    const existingIndex = searches.findIndex((search) => search.tool === item.tool && search.query === query);
    if (existingIndex >= 0) {
      originalIndexToSearchIndex[originalIndex] = existingIndex;
      continue;
    }

    if (searches.length < MAX_PLAN_SEARCHES) {
      originalIndexToSearchIndex[originalIndex] = searches.length;
      searches.push({ tool: item.tool, query });
    } else {
      originalIndexToSearchIndex[originalIndex] = undefined;
    }
  }
  return { ok: true, searches: { steps: searches, originalIndexToSearchIndex } };
}

function parseReadPolicy(value: unknown): { ok: true; readPolicy: AgentReadPolicy } | { ok: false; reason: string } {
  if (!isRecord(value)) {
    return { ok: false, reason: "readPolicy must be an object" };
  }
  const unexpected = Object.keys(value).filter((key) => key !== "maxReads" && key !== "reason");
  if (unexpected.length > 0) {
    return { ok: false, reason: `unexpected readPolicy fields: ${unexpected.join(", ")}` };
  }
  const maxReads = value.maxReads;
  if (typeof maxReads !== "number" || !Number.isInteger(maxReads) || maxReads < 0 || maxReads > 3) {
    return { ok: false, reason: "readPolicy.maxReads must be an integer from 0 to 3" };
  }
  return {
    ok: true,
    readPolicy: {
      maxReads,
      reason: typeof value.reason === "string" && value.reason.trim() ? value.reason.trim() : undefined
    }
  };
}

function parseReads(
  value: unknown,
  searches: ParsedSearches,
  maxReads: number
): { ok: true; reads: AgentPlanReadStep[] } | { ok: false; reason: string } {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "reads must be an array" };
  }
  if (value.length > maxReads) {
    return { ok: false, reason: "reads exceeds readPolicy.maxReads" };
  }
  const reads: AgentPlanReadStep[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return { ok: false, reason: "read step must be an object" };
    }
    const unexpected = Object.keys(item).filter((key) => key !== "tool" && key !== "fromSearchIndex");
    if (unexpected.length > 0) {
      return { ok: false, reason: `unexpected read fields: ${unexpected.join(", ")}` };
    }
    if (
      item.tool !== "local_file_read" &&
      item.tool !== "gmail_read_message" &&
      item.tool !== "google_doc_read" &&
      item.tool !== "google_drive_file_read"
    ) {
      return { ok: false, reason: "unsupported read tool" };
    }
    const fromSearchIndex = item.fromSearchIndex;
    if (typeof fromSearchIndex !== "number" || !Number.isInteger(fromSearchIndex)) {
      return { ok: false, reason: "fromSearchIndex must be an integer" };
    }
    if (fromSearchIndex < 0 || fromSearchIndex >= searches.originalIndexToSearchIndex.length) {
      return { ok: false, reason: "read references missing search step" };
    }
    const normalizedSearchIndex = searches.originalIndexToSearchIndex[fromSearchIndex];
    if (normalizedSearchIndex === undefined) {
      continue;
    }
    const search = searches.steps[normalizedSearchIndex];
    if (!search) {
      return { ok: false, reason: "read references missing search step" };
    }
    if (SEARCH_TO_READ_TOOL[search.tool] !== item.tool) {
      return { ok: false, reason: "read tool does not match referenced search tool" };
    }
    const tool = item.tool;
    reads.push({ tool, fromSearchIndex: normalizedSearchIndex });
  }
  return { ok: true, reads };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

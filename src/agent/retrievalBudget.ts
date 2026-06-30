export type RetrievalBudgetMode = "normal" | "expanded_single_document";

export type RetrievalBudget = {
  mode: RetrievalBudgetMode;
  googleDriveMaxTextChars: number;
  extraToolTurns: number;
  reason?: string;
};

export const NORMAL_GOOGLE_DRIVE_READ_MAX_CHARS = 4000;
export const EXPANDED_GOOGLE_DRIVE_READ_MAX_CHARS = 80_000;
export const MAX_EXPANDED_AGENT_TOOL_TURNS = 6;

export const NORMAL_RETRIEVAL_BUDGET: RetrievalBudget = {
  mode: "normal",
  googleDriveMaxTextChars: NORMAL_GOOGLE_DRIVE_READ_MAX_CHARS,
  extraToolTurns: 0
};

export function expandedSingleDocumentBudget(reason: string): RetrievalBudget {
  return {
    mode: "expanded_single_document",
    googleDriveMaxTextChars: EXPANDED_GOOGLE_DRIVE_READ_MAX_CHARS,
    extraToolTurns: 2,
    reason
  };
}

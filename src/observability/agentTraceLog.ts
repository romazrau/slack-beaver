import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config/config.js";

export type AgentTraceEvent = {
  traceId: string;
  event:
    | "agent_loop_start"
    | "clarification_requested"
    | "clarification_follow_up"
    | "model_response"
    | "tool_call_start"
    | "tool_call_result"
    | "tool_call_error"
    | "reviewer_decision"
    | "fallback_answer"
    | "final_answer";
  source: string;
  purpose: string;
  detail: Record<string, unknown>;
};

export async function writeAgentTraceLog(config: AppConfig, event: AgentTraceEvent): Promise<void> {
  const logDir = getAgentTraceLogDir(config);
  const fileName = `${new Date().toISOString().slice(0, 10)}.jsonl`;
  const entry = {
    timestamp: new Date().toISOString(),
    ...event
  };

  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(path.join(logDir, fileName), `${JSON.stringify(entry)}\n`, "utf8");
}

export function getAgentTraceLogDir(config: AppConfig): string {
  return path.join(path.dirname(config.auditLogPath), "agent-traces");
}

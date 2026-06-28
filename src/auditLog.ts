import fs from "node:fs/promises";
import path from "node:path";

export type AuditLogEntry = {
  timestamp: string;
  slackUserId: string;
  channelId: string;
  query: string;
  resultCount: number;
  status: "success" | "error";
  source?: "slash_command" | "app_home_message";
  errorSummary?: string;
};

export async function writeAuditLog(logPath: string, entry: AuditLogEntry): Promise<void> {
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

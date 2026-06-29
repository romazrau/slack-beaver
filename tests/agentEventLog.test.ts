import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config/config.js";
import { getAgentEventLogDir, writeAgentEventLog } from "../src/observability/agentEventLog.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-agent-event-log-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

function buildConfig(): AppConfig {
  return {
    slack: {
      socketModeEnabled: false
    },
    localFiles: {
      watchedFolders: [],
      denylistFolders: [],
      maxFileBytes: 1024,
      maxResults: 5
    },
    localMemory: {
      enabled: false,
      dbPath: path.join(tempDir, "memory.sqlite"),
      openAiTokenPath: path.join(tempDir, "tokens", "openai.key")
    },
    googleWorkspace: {
      enabled: false,
      tokenPath: path.join(tempDir, "tokens", "google-oauth.json"),
      redirectHost: "127.0.0.1"
    },
    ai: {
      openAiModel: "test-model",
      maxToolTurns: 2,
      maxConversationFullTurns: 8,
      conversationRecentTurnsAfterSummary: 4
    },
    auditLogPath: path.join(tempDir, "logs", "audit.jsonl"),
    agentEventLog: {
      mode: "trace",
      retentionDays: 14,
      fullDebugRetentionDays: 3
    }
  };
}

describe("writeAgentEventLog", () => {
  it("writes the stable JSONL envelope and redacts likely secrets", async () => {
    const config = buildConfig();

    await writeAgentEventLog(config, {
      traceId: "trace-1",
      turnId: "turn-1",
      conversationId: "slack:D123:111.222",
      agentRole: "planner",
      event: "planner_output",
      source: "app_home_message",
      slack: {
        userId: "U123",
        channelId: "D123",
        threadTs: "111.222"
      },
      io: {
        direction: "output",
        kind: "model_response",
        summary: "Planner selected one local search.",
        payloadRedacted: {
          query: "deployment",
          token: "sk-secret-token-1234567890",
          privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
        }
      }
    });

    const files = await fs.readdir(getAgentEventLogDir(config));
    const content = await fs.readFile(path.join(getAgentEventLogDir(config), files[0] ?? ""), "utf8");
    const parsed = JSON.parse(content.trim());

    expect(parsed).toMatchObject({
      traceId: "trace-1",
      turnId: "turn-1",
      conversationId: "slack:D123:111.222",
      agentRole: "planner",
      event: "planner_output",
      source: "app_home_message",
      slack: {
        userId: "U123",
        channelId: "D123",
        threadTs: "111.222"
      },
      io: {
        summary: "Planner selected one local search."
      }
    });
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.localTime).toContain("Asia/Taipei");
    expect(content).not.toContain("sk-secret-token");
    expect(content).not.toContain("BEGIN PRIVATE KEY");
    expect(content).toContain("[REDACTED]");
  });
});

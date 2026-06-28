import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeAuditLog } from "../src/observability/auditLog.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-audit-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("writeAuditLog", () => {
  it("writes one JSONL entry without file contents", async () => {
    const logPath = path.join(tempDir, "logs", "audit.jsonl");

    await writeAuditLog(logPath, {
      timestamp: "2026-06-28T00:00:00.000Z",
      slackUserId: "U123",
      channelId: "C123",
      query: "onboarding",
      resultCount: 2,
      status: "success",
      source: "app_home_message"
    });

    const content = await fs.readFile(logPath, "utf8");
    const parsed = JSON.parse(content.trim());

    expect(parsed).toMatchObject({
      slackUserId: "U123",
      channelId: "C123",
      query: "onboarding",
      resultCount: 2,
      status: "success",
      source: "app_home_message"
    });
    expect(content).not.toContain("Welcome to the team");
  });
});

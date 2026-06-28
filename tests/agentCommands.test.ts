import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAgentTextCommand } from "../src/agent/agentCommands.js";
import type { AppConfig } from "../src/config/config.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-agent-command-"));
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
      watchedFolders: [tempDir],
      denylistFolders: [],
      maxFileBytes: 1024,
      maxResults: 5
    },
    localMemory: {
      enabled: false,
      dbPath: path.join(tempDir, "memory.sqlite"),
      openAiTokenPath: path.join(tempDir, "tokens", "openai.key")
    },
    auditLogPath: path.join(tempDir, "logs", "audit.jsonl")
  };
}

describe("runAgentTextCommand", () => {
  it("runs find once and writes source to audit log", async () => {
    await fs.writeFile(path.join(tempDir, "notes.md"), "Socket Mode setup", "utf8");
    const config = buildConfig();

    const response = await runAgentTextCommand({
      text: "find Socket",
      slackUserId: "U123",
      channelId: "D123",
      source: "app_home_message",
      config
    });

    expect(response).toContain("Found 1 local file match");

    const auditLine = await fs.readFile(config.auditLogPath, "utf8");
    const parsed = JSON.parse(auditLine.trim());

    expect(parsed).toMatchObject({
      slackUserId: "U123",
      channelId: "D123",
      query: "Socket",
      resultCount: 1,
      status: "success",
      source: "app_home_message"
    });
  });

  it("returns chat usage for invalid app messages without writing audit log", async () => {
    const config = buildConfig();

    const response = await runAgentTextCommand({
      text: "list tasks",
      slackUserId: "U123",
      channelId: "D123",
      source: "app_home_message",
      config
    });

    expect(response).toBe("Unsupported command. Usage: find <query>");
    await expect(fs.readFile(config.auditLogPath, "utf8")).rejects.toThrow();
  });

  it("keeps slash command usage for invalid slash commands", async () => {
    const config = buildConfig();

    const response = await runAgentTextCommand({
      text: "",
      slackUserId: "U123",
      channelId: "D123",
      source: "slash_command",
      config
    });

    expect(response).toBe("Usage: /agent find <query>");
    await expect(fs.readFile(config.auditLogPath, "utf8")).rejects.toThrow();
  });

  it("asks for local folder setup when no folders are known", async () => {
    const config = buildConfig();
    config.localFiles.watchedFolders = [];
    config.localMemory.enabled = true;

    const response = await runAgentTextCommand({
      text: "find Socket",
      slackUserId: "U123",
      channelId: "D123",
      source: "app_home_message",
      config
    });

    expect(response).toContain("I am initialized");
    expect(response).toContain("Setup checklist");
    expect(response).toContain("npm run agent:folders:add");
    expect(response).toContain("npm run agent:secrets:set-openai");
    expect(response).toContain("AI agent can be enabled");
    await expect(fs.readFile(config.auditLogPath, "utf8")).rejects.toThrow();
  });

  it("refuses token-like Slack messages without writing them to audit", async () => {
    const config = buildConfig();
    const fakeToken = `sk-${"1".repeat(30)}`;
    const response = await runAgentTextCommand({
      text: fakeToken,
      slackUserId: "U123",
      channelId: "D123",
      source: "app_home_message",
      config
    });

    expect(response).toContain("cannot accept API keys");
    expect(response).toContain("npm run agent:secrets:set-openai");
    expect(response).toContain("AI agent can be enabled");
    await expect(fs.readFile(config.auditLogPath, "utf8")).rejects.toThrow();
  });

  it("does not reset memory from Slack and returns local-only guidance", async () => {
    const config = buildConfig();
    const response = await runAgentTextCommand({
      text: "reset memory",
      slackUserId: "U123",
      channelId: "D123",
      source: "app_home_message",
      config
    });

    expect(response).toContain("must be done on this computer");
    expect(response).toContain("I will not delete local memory from a Slack message");
    expect(response).toContain("RESET_LOCAL_MEMORY");
    expect(response).toContain("After reset");
    expect(response).toContain("AI agent can be enabled");
    await expect(fs.readFile(config.auditLogPath, "utf8")).rejects.toThrow();
  });
});

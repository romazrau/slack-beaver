import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLocalCli } from "../src/cli/localCli.js";
import { LocalMemoryStore, mergeUniquePaths } from "../src/memory/localMemory.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-memory-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("LocalMemoryStore", () => {
  it("stores allowed folders and provider configuration without token values", () => {
    const store = new LocalMemoryStore(path.join(tempDir, "memory.sqlite"));

    store.upsertAllowedFolder("/tmp/b");
    store.upsertAllowedFolder("/tmp/a");
    store.setProviderTokenConfigured("openai", true);

    expect(store.listEnabledAllowedFolderPaths()).toEqual(["/tmp/a", "/tmp/b"]);
    expect(store.getProviderConfig("openai")).toMatchObject({
      provider: "openai",
      tokenConfigured: true
    });

    store.close();
  });

  it("records tool call summaries", () => {
    const store = new LocalMemoryStore(path.join(tempDir, "memory.sqlite"));

    expect(() =>
      store.recordToolCall({
        source: "app_home_message",
        toolName: "local_search",
        inputSummary: "query length=6",
        outputSummary: "result count=1",
        status: "success"
      })
    ).not.toThrow();

    store.close();
  });

  it("stores settings without adding new schema tables", () => {
    const store = new LocalMemoryStore(path.join(tempDir, "memory.sqlite"));

    store.setSetting("openai.model", "gpt-5.5");
    store.setSetting("openai.model", "gpt-5.4-mini");

    expect(store.getSetting("openai.model")).toMatchObject({
      key: "openai.model",
      value: "gpt-5.4-mini"
    });

    store.close();
  });

  it("records runtime heartbeat state", () => {
    const store = new LocalMemoryStore(path.join(tempDir, "memory.sqlite"));

    const first = store.recordRuntimeHeartbeat("local-agent", new Date("2026-06-29T10:00:00.000Z"));
    const second = store.recordRuntimeHeartbeat("local-agent", new Date("2026-06-29T10:01:00.000Z"));

    expect(first).toEqual({
      processName: "local-agent",
      lastSeenAt: "2026-06-29T10:00:00.000Z"
    });
    expect(second).toEqual({
      processName: "local-agent",
      lastSeenAt: "2026-06-29T10:01:00.000Z"
    });
    expect(store.getRuntimeStatus("local-agent")).toEqual(second);

    store.close();
  });

  it("stores conversation turns and summary by Slack conversation key", () => {
    const store = new LocalMemoryStore(path.join(tempDir, "memory.sqlite"));

    store.appendConversationTurn({
      slackUserId: "U1",
      channelId: "D1",
      userText: "first",
      assistantReply: "reply",
      source: "app_home_message"
    });
    store.appendConversationTurn({
      slackUserId: "U2",
      channelId: "D1",
      userText: "other user",
      assistantReply: "other reply",
      source: "app_home_message"
    });
    store.upsertConversationSummary({
      slackUserId: "U1",
      channelId: "D1",
      summary: "User wants a concise summary.",
      source: "app_home_message"
    });

    expect(store.listConversationTurns("U1", "D1")).toMatchObject([
      {
        kind: "full",
        userText: "first",
        assistantReply: "reply"
      },
      {
        kind: "summary",
        userText: null,
        assistantReply: "User wants a concise summary."
      }
    ]);
    expect(store.listConversationTurns("U2", "D1")).toHaveLength(1);

    store.close();
  });

  it("resets local memory tables and reports deleted counts", () => {
    const store = new LocalMemoryStore(path.join(tempDir, "memory.sqlite"));

    store.upsertAllowedFolder("/tmp/a");
    store.setSetting("openai.model", "gpt-5.5");
    store.setProviderTokenConfigured("openai", true);
    store.recordToolCall({
      source: "app_home_message",
      toolName: "local_search",
      inputSummary: "query length=6",
      status: "success"
    });
    store.appendConversationTurn({
      slackUserId: "U1",
      channelId: "D1",
      userText: "hello",
      assistantReply: "hi",
      source: "app_home_message"
    });

    expect(store.resetAll()).toMatchObject({
      allowedFolders: 1,
      settings: 1,
      conversations: 1,
      toolCalls: 1,
      providerConfig: 1
    });
    expect(store.listAllowedFolders()).toEqual([]);
    expect(store.listConversationTurns("U1", "D1")).toEqual([]);
    expect(store.getSetting("openai.model")).toBeUndefined();
    expect(store.getProviderConfig("openai")).toBeUndefined();

    store.close();
  });
});

describe("mergeUniquePaths", () => {
  it("deduplicates and resolves paths deterministically", () => {
    expect(mergeUniquePaths(["/tmp/a", "/tmp/b"], ["/tmp/a"])).toEqual(["/tmp/a", "/tmp/b"]);
  });
});

describe("runLocalCli", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("adds, lists, and removes allowed folders", async () => {
    process.env = {
      ...originalEnv,
      SLACK_SOCKET_MODE_ENABLED: "false",
      WATCHED_FOLDERS: "",
      LOCAL_MEMORY_DB_PATH: path.join(tempDir, "cli.sqlite"),
      OPENAI_TOKEN_PATH: path.join(tempDir, "tokens", "openai.key")
    };

    await expect(runLocalCli(["folders:add", tempDir])).resolves.toMatchObject({
      code: 0
    });
    await expect(runLocalCli(["folders:list"])).resolves.toMatchObject({
      code: 0,
      message: expect.stringContaining(await fs.realpath(tempDir))
    });
    await expect(runLocalCli(["folders:remove", await fs.realpath(tempDir)])).resolves.toMatchObject({
      code: 0
    });
  });

  it("requires double confirmation before resetting memory", async () => {
    process.env = {
      ...originalEnv,
      SLACK_SOCKET_MODE_ENABLED: "false",
      WATCHED_FOLDERS: "",
      LOCAL_MEMORY_DB_PATH: path.join(tempDir, "cli-reset.sqlite"),
      OPENAI_TOKEN_PATH: path.join(tempDir, "tokens", "openai.key")
    };

    await runLocalCli(["folders:add", tempDir]);
    await expect(runLocalCli(["memory:reset"])).resolves.toMatchObject({
      code: 1,
      message: expect.stringContaining("Reset is blocked")
    });
    await expect(runLocalCli(["folders:list"])).resolves.toMatchObject({
      message: expect.stringContaining(await fs.realpath(tempDir))
    });

    await expect(
      runLocalCli(["memory:reset", "--confirm", "RESET_LOCAL_MEMORY", "--yes"])
    ).resolves.toMatchObject({
      code: 0,
      message: expect.stringContaining("Local memory has been reset")
    });
    await expect(runLocalCli(["folders:list"])).resolves.toMatchObject({
      message: "No allowed folders saved."
    });
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalMemoryStore, mergeUniquePaths } from "../src/localMemory.js";
import { runLocalCli } from "../src/localCli.js";

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

  it("resets local memory tables and reports deleted counts", () => {
    const store = new LocalMemoryStore(path.join(tempDir, "memory.sqlite"));

    store.upsertAllowedFolder("/tmp/a");
    store.setProviderTokenConfigured("openai", true);
    store.recordToolCall({
      source: "app_home_message",
      toolName: "local_search",
      inputSummary: "query length=6",
      status: "success"
    });

    expect(store.resetAll()).toMatchObject({
      allowedFolders: 1,
      toolCalls: 1,
      providerConfig: 1
    });
    expect(store.listAllowedFolders()).toEqual([]);
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

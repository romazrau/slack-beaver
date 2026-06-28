import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads local search config with Slack disabled", () => {
    const config = loadConfig({
      SLACK_SOCKET_MODE_ENABLED: "false",
      WATCHED_FOLDERS: "/tmp/a,/tmp/b",
      DENYLIST_FOLDERS: "/tmp/a/private",
      MAX_LOCAL_FILE_BYTES: "1234",
      MAX_SEARCH_RESULTS: "7",
      LOCAL_MEMORY_ENABLED: "false",
      AUDIT_LOG_PATH: "./tmp/audit.jsonl"
    });

    expect(config.slack.socketModeEnabled).toBe(false);
    expect(config.localFiles.watchedFolders).toEqual([path.resolve("/tmp/a"), path.resolve("/tmp/b")]);
    expect(config.localFiles.denylistFolders).toEqual([path.resolve("/tmp/a/private")]);
    expect(config.localFiles.maxFileBytes).toBe(1234);
    expect(config.localFiles.maxResults).toBe(7);
    expect(config.localMemory.enabled).toBe(false);
    expect(config.auditLogPath).toBe("./tmp/audit.jsonl");
  });

  it("requires Slack tokens when Socket Mode is enabled", () => {
    expect(() =>
      loadConfig({
        WATCHED_FOLDERS: "/tmp/a"
      })
    ).toThrow(/SLACK_BOT_TOKEN.*SLACK_APP_TOKEN/s);
  });

  it("requires at least one watched folder", () => {
    expect(() =>
      loadConfig({
        SLACK_SOCKET_MODE_ENABLED: "false",
        LOCAL_MEMORY_ENABLED: "false"
      })
    ).toThrow(/WATCHED_FOLDERS/);
  });

  it("allows empty watched folders when local memory is enabled", () => {
    const config = loadConfig({
      SLACK_SOCKET_MODE_ENABLED: "false",
      LOCAL_MEMORY_DB_PATH: "./tmp/memory.sqlite",
      OPENAI_TOKEN_PATH: "./tokens/openai.key"
    });

    expect(config.localFiles.watchedFolders).toEqual([]);
    expect(config.localMemory).toEqual({
      enabled: true,
      dbPath: "./tmp/memory.sqlite",
      openAiTokenPath: "./tokens/openai.key"
    });
  });
});

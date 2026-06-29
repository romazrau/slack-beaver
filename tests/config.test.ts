import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/config.js";

describe("loadConfig", () => {
  it("loads local search config with Slack disabled", () => {
    const config = loadConfig({
      SLACK_SOCKET_MODE_ENABLED: "false",
      WATCHED_FOLDERS: "/tmp/a,/tmp/b",
      DENYLIST_FOLDERS: "/tmp/a/private",
      MAX_LOCAL_FILE_BYTES: "1234",
      MAX_SEARCH_RESULTS: "7",
      LOCAL_MEMORY_ENABLED: "false",
      GOOGLE_WORKSPACE_ENABLED: "true",
      GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
      GOOGLE_TOKEN_PATH: "./tokens/google.json",
      GOOGLE_OAUTH_REDIRECT_HOST: "localhost",
      AUDIT_LOG_PATH: "./tmp/audit.jsonl"
    });

    expect(config.slack.socketModeEnabled).toBe(false);
    expect(config.localFiles.watchedFolders).toEqual([path.resolve("/tmp/a"), path.resolve("/tmp/b")]);
    expect(config.localFiles.denylistFolders).toEqual([path.resolve("/tmp/a/private")]);
    expect(config.localFiles.maxFileBytes).toBe(1234);
    expect(config.localFiles.maxResults).toBe(7);
    expect(config.localMemory.enabled).toBe(false);
    expect(config.googleWorkspace).toEqual({
      enabled: true,
      oauthClientId: "google-client-id",
      oauthClientSecret: "google-client-secret",
      tokenPath: "./tokens/google.json",
      redirectHost: "localhost"
    });
    expect(config.ai).toEqual({
      openAiModel: "gpt-5.5",
      maxToolTurns: 2,
      maxConversationFullTurns: 8,
      conversationRecentTurnsAfterSummary: 4
    });
    expect(config.auditLogPath).toBe("./tmp/audit.jsonl");
  });

  it("requires Slack tokens when Socket Mode is enabled", () => {
    expect(() =>
      loadConfig({
        WATCHED_FOLDERS: "/tmp/a"
      })
    ).toThrow(/SLACK_BOT_TOKEN.*SLACK_APP_TOKEN/s);
  });

  it("allows local setup CLI config without Slack tokens", () => {
    const config = loadConfig(
      {
        SLACK_SOCKET_MODE_ENABLED: "true",
        LOCAL_MEMORY_DB_PATH: "./tmp/memory.sqlite",
        OPENAI_TOKEN_PATH: "./tokens/openai.key"
      },
      { requireSlackTokens: false }
    );

    expect(config.slack.socketModeEnabled).toBe(true);
    expect(config.slack.botToken).toBeUndefined();
    expect(config.slack.appToken).toBeUndefined();
    expect(config.localMemory.openAiTokenPath).toBe("./tokens/openai.key");
    expect(config.googleWorkspace).toEqual({
      enabled: false,
      tokenPath: "./tokens/google-oauth.json",
      redirectHost: "127.0.0.1"
    });
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
    expect(config.googleWorkspace.enabled).toBe(false);
  });

  it("loads AI model and tool-turn settings", () => {
    const config = loadConfig({
      SLACK_SOCKET_MODE_ENABLED: "false",
      OPENAI_MODEL: "gpt-test",
      MAX_AGENT_TOOL_TURNS: "3",
      MAX_CONVERSATION_FULL_TURNS: "6",
      CONVERSATION_RECENT_TURNS_AFTER_SUMMARY: "2"
    });

    expect(config.ai).toEqual({
      openAiModel: "gpt-test",
      maxToolTurns: 3,
      maxConversationFullTurns: 6,
      conversationRecentTurnsAfterSummary: 2
    });
  });
});

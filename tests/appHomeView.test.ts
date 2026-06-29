import { describe, expect, it } from "vitest";
import { buildAppHomeView, formatLocalAgentRuntimeStatus } from "../src/slack/appHomeView.js";
import type { AppConfig } from "../src/config/config.js";

describe("buildAppHomeView", () => {
  it("shows local agent status without secrets or folder paths", () => {
    const config: AppConfig = {
      slack: {
        socketModeEnabled: true,
        botToken: "xoxb-secret",
        appToken: "xapp-secret"
      },
      localFiles: {
        watchedFolders: ["/Users/example/Documents"],
        denylistFolders: ["/Users/example/.ssh"],
        maxFileBytes: 1024,
        maxResults: 5
      },
      localMemory: {
        enabled: true,
        dbPath: "./data/test.sqlite",
        openAiTokenPath: "./tokens/openai.key"
      },
      googleWorkspace: {
        enabled: false,
        tokenPath: "./tokens/google-oauth.json",
        redirectHost: "127.0.0.1"
      },
      ai: {
        openAiModel: "test-model",
        maxToolTurns: 2,
        maxConversationFullTurns: 8,
        conversationRecentTurnsAfterSummary: 4
      },
      auditLogPath: "./logs/audit.jsonl"
    };

    const view = buildAppHomeView(config);
    const serialized = JSON.stringify(view);

    expect(view.type).toBe("home");
    expect(serialized).toContain("Slack Beaver Local Agent");
    expect(serialized).toContain("Local Agent runtime");
    expect(serialized).toContain("Not seen yet");
    expect(serialized).toContain("find <query>");
    expect(serialized).toContain("Allowed folders");
    expect(serialized).toContain("Enable AI answers");
    expect(serialized).toContain("npm run agent:secrets:set-openai");
    expect(serialized).not.toContain("xoxb-secret");
    expect(serialized).not.toContain("xapp-secret");
    expect(serialized).not.toContain("/Users/example/Documents");
    expect(serialized).not.toContain("/Users/example/.ssh");
  });

  it("shows setup guidance when no allowed folders are known", () => {
    const config: AppConfig = {
      slack: {
        socketModeEnabled: true
      },
      localFiles: {
        watchedFolders: [],
        denylistFolders: [],
        maxFileBytes: 1024,
        maxResults: 5
      },
      localMemory: {
        enabled: true,
        dbPath: "./data/test.sqlite",
        openAiTokenPath: "./tokens/openai.key"
      },
      googleWorkspace: {
        enabled: false,
        tokenPath: "./tokens/google-oauth.json",
        redirectHost: "127.0.0.1"
      },
      ai: {
        openAiModel: "test-model",
        maxToolTurns: 2,
        maxConversationFullTurns: 8,
        conversationRecentTurnsAfterSummary: 4
      },
      auditLogPath: "./logs/audit.jsonl"
    };

    const serialized = JSON.stringify(buildAppHomeView(config, { allowedFolderCount: 0 }));

    expect(serialized).toContain("Setup needed");
    expect(serialized).toContain("npm run agent:folders:add");
    expect(serialized).toContain("npm run agent:folders:list");
    expect(serialized).toContain("npm run agent:secrets:set-openai");
    expect(serialized).toContain("ask <question>");
    expect(serialized).toContain("AI agent token");
  });

  it("shows ready state without setup command when the AI agent token is configured", () => {
    const config: AppConfig = {
      slack: {
        socketModeEnabled: true
      },
      localFiles: {
        watchedFolders: ["/Users/example/Documents"],
        denylistFolders: [],
        maxFileBytes: 1024,
        maxResults: 5
      },
      localMemory: {
        enabled: true,
        dbPath: "./data/test.sqlite",
        openAiTokenPath: "./tokens/openai.key"
      },
      googleWorkspace: {
        enabled: false,
        tokenPath: "./tokens/google-oauth.json",
        redirectHost: "127.0.0.1"
      },
      ai: {
        openAiModel: "test-model",
        maxToolTurns: 2,
        maxConversationFullTurns: 8,
        conversationRecentTurnsAfterSummary: 4
      },
      auditLogPath: "./logs/audit.jsonl"
    };

    const serialized = JSON.stringify(
      buildAppHomeView(config, {
        allowedFolderCount: 1,
        openAiTokenConfigured: true
      })
    );

    expect(serialized).toContain("AI agent token");
    expect(serialized).toContain("Configured locally");
    expect(serialized).toContain("Ready for `ask <question>`");
    expect(serialized).not.toContain("Enable AI answers");
  });

  it("formats local agent runtime status from heartbeat age", () => {
    expect(
      formatLocalAgentRuntimeStatus(
        "2026-06-29T10:00:00.000Z",
        new Date("2026-06-29T10:01:30.000Z")
      )
    ).toEqual({
      label: "Online",
      detail: "Last Local Agent heartbeat: 2026-06-29T10:00:00.000Z"
    });

    expect(
      formatLocalAgentRuntimeStatus(
        "2026-06-29T10:00:00.000Z",
        new Date("2026-06-29T10:03:00.000Z")
      ).label
    ).toBe("Stale");
    expect(formatLocalAgentRuntimeStatus(undefined, new Date("2026-06-29T10:00:00.000Z")).label).toBe(
      "Not seen yet"
    );
    expect(
      formatLocalAgentRuntimeStatus(undefined, new Date("2026-06-29T10:00:00.000Z"), false).label
    ).toBe("Not tracked");
  });
});

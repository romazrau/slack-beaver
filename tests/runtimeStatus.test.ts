import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config/config.js";
import { LocalMemoryStore } from "../src/memory/localMemory.js";
import {
  buildRuntimeStatusSnapshot,
  formatRuntimeNotice,
  resolveRuntimeNoticeTarget,
  saveRuntimeNoticeTarget,
  sendRuntimeNotice
} from "../src/slack/runtimeStatus.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-runtime-status-"));
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
      watchedFolders: [path.join(tempDir, "env-folder")],
      denylistFolders: [],
      maxFileBytes: 1024,
      maxResults: 5
    },
    localMemory: {
      enabled: true,
      dbPath: path.join(tempDir, "memory.sqlite"),
      openAiTokenPath: path.join(tempDir, "tokens", "openai.key")
    },
    googleWorkspace: {
      enabled: true,
      tokenPath: path.join(tempDir, "tokens", "google-oauth.json"),
      redirectHost: "127.0.0.1"
    },
    ai: {
      openAiModel: "test-model",
      maxToolTurns: 2,
      maxConversationFullTurns: 8,
      conversationRecentTurnsAfterSummary: 4
    },
    auditLogPath: path.join(tempDir, "logs", "audit.jsonl")
  };
}

describe("runtime status notices", () => {
  it("resolves lifecycle notice targets by env, subscription, and recent conversation", () => {
    const config = buildConfig();
    const store = new LocalMemoryStore(config.localMemory.dbPath);

    expect(resolveRuntimeNoticeTarget(config, store)).toEqual({
      channelId: undefined,
      source: "none"
    });

    store.appendConversationTurn({
      slackUserId: "U123",
      channelId: "D_RECENT",
      userText: "hello",
      assistantReply: "hi",
      source: "app_home_message"
    });
    expect(resolveRuntimeNoticeTarget(config, store)).toEqual({
      channelId: "D_RECENT",
      source: "recent_conversation"
    });

    saveRuntimeNoticeTarget(store, {
      channelId: "D_SUBSCRIBED",
      slackUserId: "U123"
    });
    expect(resolveRuntimeNoticeTarget(config, store)).toEqual({
      channelId: "D_SUBSCRIBED",
      source: "subscribed"
    });

    config.slack.statusChannelId = "D_ENV";
    expect(resolveRuntimeNoticeTarget(config, store)).toEqual({
      channelId: "D_ENV",
      source: "env"
    });

    store.close();
  });

  it("formats online and offline notices without secrets", () => {
    const config = buildConfig();
    const store = new LocalMemoryStore(config.localMemory.dbPath);
    store.upsertAllowedFolder(path.join(tempDir, "conversation-folder"));
    store.setProviderTokenConfigured("openai", true);
    store.setProviderTokenConfigured("google", true);
    saveRuntimeNoticeTarget(store, {
      channelId: "D123",
      slackUserId: "U123"
    });
    store.close();

    const snapshot = buildRuntimeStatusSnapshot(config);
    const online = formatRuntimeNotice("online", snapshot, new Date("2026-06-29T10:00:00.000Z"));
    const offline = formatRuntimeNotice("offline", snapshot, new Date("2026-06-29T10:01:00.000Z"));

    expect(online).toContain("Local Agent is online");
    expect(online).toContain("AI agent token: configured locally");
    expect(online).toContain("Google Workspace: connected locally");
    expect(online).toContain("Lifecycle notices: subscribed `D123`");
    expect(online).toContain("conversation-folder");
    expect(online).toContain("confirm folders add /absolute/path");
    expect(offline).toContain("Local Agent is offline");
    expect(online).not.toContain("xoxb");
    expect(online).not.toContain("openai.key");
  });

  it("sends notices when a target exists and logs when no target exists", async () => {
    const config = buildConfig();
    config.slack.statusChannelId = "D_ENV";
    const posted: Array<{ channel: string; text: string }> = [];
    const client = {
      chat: {
        async postMessage(input: { channel: string; text: string }) {
          posted.push(input);
        }
      }
    };

    await sendRuntimeNotice({
      client,
      config,
      kind: "online",
      now: new Date("2026-06-29T10:00:00.000Z")
    });

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      channel: "D_ENV"
    });
    expect(posted[0]?.text).toContain("Local Agent is online");

    config.slack.statusChannelId = undefined;
    const logs: string[] = [];
    await sendRuntimeNotice({
      client,
      config,
      kind: "offline",
      logger: {
        info(message) {
          logs.push(message);
        },
        warn(message) {
          logs.push(message);
        }
      }
    });

    expect(posted).toHaveLength(1);
    expect(logs.join("\n")).toContain("No Slack lifecycle notice target configured");
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config/config.js";
import { saveGoogleOAuthToken } from "../src/google/googleAuth.js";
import { LocalMemoryStore } from "../src/memory/localMemory.js";
import {
  checkGoogleWorkspaceStartupConnection,
  formatGoogleWorkspaceStartupGuidance,
  formatMissingAiAgentTokenStartupGuidance,
  recordGoogleWorkspaceStartupCheck
} from "../src/setup/startupGuidance.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-startup-guidance-"));
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
      enabled: true,
      dbPath: path.join(tempDir, "memory.sqlite"),
      openAiTokenPath: path.join(tempDir, "tokens", "openai.key")
    },
    googleWorkspace: {
      enabled: true,
      oauthClientId: "google-client-id",
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

describe("formatMissingAiAgentTokenStartupGuidance", () => {
  it("points users to local token setup without asking for Slack secrets", () => {
    const message = formatMissingAiAgentTokenStartupGuidance();

    expect(message).toContain("AI agent token is not configured locally");
    expect(message).toContain("npm run agent:secrets:set-openai");
    expect(message).toContain("another terminal");
    expect(message).toContain("Do not paste API keys into Slack");
  });
});

describe("Google Workspace startup guidance", () => {
  it("does not notify when Google Workspace is disabled", async () => {
    const config = buildConfig();
    config.googleWorkspace.enabled = false;

    const check = await checkGoogleWorkspaceStartupConnection(config);

    expect(check).toEqual({ status: "disabled" });
    expect(formatGoogleWorkspaceStartupGuidance(check)).toBeUndefined();
  });

  it("guides users to configure Google OAuth before login", async () => {
    const config = buildConfig();
    config.googleWorkspace.oauthClientId = undefined;

    const check = await checkGoogleWorkspaceStartupConnection(config);
    const guidance = formatGoogleWorkspaceStartupGuidance(check);

    expect(check).toMatchObject({
      status: "needs_setup",
      reason: "GOOGLE_OAUTH_CLIENT_ID is missing."
    });
    expect(guidance).toContain("Google Workspace is enabled");
    expect(guidance).toContain("npm run agent:google:login");
    expect(guidance).toContain("GOOGLE_OAUTH_CLIENT_ID");
    expect(guidance).toContain("Do not paste Google tokens into Slack");
  });

  it("guides users to login when the local Google token is missing", async () => {
    const check = await checkGoogleWorkspaceStartupConnection(buildConfig());

    expect(check).toMatchObject({
      status: "needs_setup"
    });
    expect(formatGoogleWorkspaceStartupGuidance(check)).toContain("npm run agent:google:status");
  });

  it("requires login again when an expired token cannot be refreshed", async () => {
    const config = buildConfig();
    await saveGoogleOAuthToken(config.googleWorkspace.tokenPath, {
      accessToken: "expired-access-token",
      expiresAt: Date.parse("2026-06-29T10:00:00.000Z"),
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"]
    });

    const check = await checkGoogleWorkspaceStartupConnection(
      config,
      Date.parse("2026-06-29T10:02:00.000Z")
    );

    expect(check).toEqual({
      status: "needs_setup",
      reason: "Google token is expired and does not include a refresh token."
    });
  });

  it("records connected Google status in local memory after a valid startup check", async () => {
    const config = buildConfig();
    await saveGoogleOAuthToken(config.googleWorkspace.tokenPath, {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.parse("2026-06-29T11:00:00.000Z"),
      scopes: ["openid", "email", "https://www.googleapis.com/auth/drive.readonly"],
      accountEmail: "owner@example.com"
    });

    const check = await checkGoogleWorkspaceStartupConnection(
      config,
      Date.parse("2026-06-29T10:00:00.000Z")
    );
    recordGoogleWorkspaceStartupCheck(config, check);

    expect(check).toEqual({
      status: "connected",
      accountEmail: "owner@example.com",
      scopes: ["openid", "email", "https://www.googleapis.com/auth/drive.readonly"]
    });
    expect(formatGoogleWorkspaceStartupGuidance(check)).toBeUndefined();

    const store = new LocalMemoryStore(config.localMemory.dbPath);
    expect(store.getProviderConfig("google")?.tokenConfigured).toBe(true);
    expect(store.getSetting("google.account_email")?.value).toBe("owner@example.com");
    expect(store.getSetting("google.granted_scopes")?.value).toContain("drive.readonly");
    store.close();
  });

  it("records disconnected Google status in local memory when setup is incomplete", () => {
    const config = buildConfig();
    const store = new LocalMemoryStore(config.localMemory.dbPath);
    store.setProviderTokenConfigured("google", true);
    store.setSetting("google.account_email", "stale@example.com");
    store.setSetting("google.granted_scopes", "stale-scope");
    store.close();

    recordGoogleWorkspaceStartupCheck(config, {
      status: "needs_setup",
      reason: "Google account is not connected."
    });

    const updatedStore = new LocalMemoryStore(config.localMemory.dbPath);
    expect(updatedStore.getProviderConfig("google")?.tokenConfigured).toBe(false);
    expect(updatedStore.getSetting("google.account_email")).toBeUndefined();
    expect(updatedStore.getSetting("google.granted_scopes")).toBeUndefined();
    updatedStore.close();
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config/config.js";
import {
  generatePkcePair,
  loadGoogleOAuthToken,
  saveGoogleOAuthToken,
  validateGoogleOAuthCallback
} from "../src/google/googleAuth.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-google-auth-"));
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

describe("Google OAuth helpers", () => {
  it("generates a PKCE verifier and challenge", () => {
    const pair = generatePkcePair();

    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.challenge).not.toBe(pair.verifier);
  });

  it("rejects a callback with a mismatched state", () => {
    expect(() =>
      validateGoogleOAuthCallback(new URLSearchParams("state=wrong-state&code=test-code"), "expected-state")
    ).toThrow("state validation");
  });

  it("rejects Google token files with broad permissions", async () => {
    const tokenPath = path.join(tempDir, "tokens", "google-oauth.json");
    await saveGoogleOAuthToken(tokenPath, {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 3600_000,
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"]
    });
    await fs.chmod(tokenPath, 0o644);

    await expect(loadGoogleOAuthToken(tokenPath)).rejects.toThrow("permissions are too broad");
  });

  it("returns setup guidance when the Google token is missing", async () => {
    await expect(loadGoogleOAuthToken(path.join(tempDir, "missing.json"))).rejects.toThrow(
      "npm run agent:google:login"
    );
  });
});

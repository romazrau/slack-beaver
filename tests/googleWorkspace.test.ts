import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config/config.js";
import { saveGoogleOAuthToken } from "../src/google/googleAuth.js";
import { createConfiguredGoogleWorkspaceClient } from "../src/google/googleWorkspace.js";
import { LocalMemoryStore } from "../src/memory/localMemory.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-google-workspace-"));
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

describe("Google Workspace client", () => {
  it("refreshes an expired access token before reading Gmail metadata", async () => {
    const config = buildConfig();
    await saveGoogleOAuthToken(config.googleWorkspace.tokenPath, {
      accessToken: "expired-access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() - 1000,
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      accountEmail: "owner@example.com"
    });
    const memory = new LocalMemoryStore(config.localMemory.dbPath);
    const requestedUrls: string[] = [];

    const fetchFn: typeof fetch = async (input, init) => {
      const url = input.toString();
      requestedUrls.push(url);
      if (url === "https://oauth2.googleapis.com/token") {
        expect(init?.method).toBe("POST");
        return jsonResponse({
          access_token: "fresh-access-token",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/gmail.readonly"
        });
      }
      expect(init?.headers).toEqual({ authorization: "Bearer fresh-access-token" });
      if (url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/messages?")) {
        return jsonResponse({ messages: [{ id: "msg-1" }] });
      }
      return jsonResponse({
        id: "msg-1",
        snippet: "Project launch notes",
        payload: {
          headers: [
            { name: "Subject", value: "Launch" },
            { name: "From", value: "lead@example.com" },
            { name: "Date", value: "Mon, 29 Jun 2026 10:00:00 +0000" }
          ]
        }
      });
    };

    const client = await createConfiguredGoogleWorkspaceClient({ config, memoryStore: memory, fetchFn });
    const results = await client.gmailSearch("launch");

    expect(results).toEqual([
      {
        messageId: "msg-1",
        subject: "Launch",
        from: "lead@example.com",
        date: "Mon, 29 Jun 2026 10:00:00 +0000",
        snippet: "Project launch notes"
      }
    ]);
    expect(requestedUrls[0]).toBe("https://oauth2.googleapis.com/token");
    expect(memory.getProviderConfig("google")?.tokenConfigured).toBe(true);
    expect(memory.getSetting("google.account_email")?.value).toBe("owner@example.com");
    memory.close();
  });

  it("reads Google Docs content with bounded output", async () => {
    const config = buildConfig();
    await saveGoogleOAuthToken(config.googleWorkspace.tokenPath, {
      accessToken: "access-token",
      expiresAt: Date.now() + 3600_000,
      scopes: ["https://www.googleapis.com/auth/documents.readonly"]
    });

    const fetchFn: typeof fetch = async () =>
      jsonResponse({
        title: "Planning Doc",
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  { textRun: { content: "A".repeat(5000) } },
                  { textRun: { content: "tail should be truncated" } }
                ]
              }
            }
          ]
        }
      });

    const client = await createConfiguredGoogleWorkspaceClient({ config, fetchFn });
    const doc = await client.googleDocRead("doc_123");

    expect(doc.title).toBe("Planning Doc");
    expect(doc.content).toHaveLength(4012);
    expect(doc.content).toContain("[truncated]");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

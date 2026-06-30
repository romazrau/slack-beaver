import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config/config.js";
import { saveGoogleOAuthToken } from "../src/google/googleAuth.js";
import {
  GoogleWorkspaceRequestError,
  createConfiguredGoogleWorkspaceClient
} from "../src/google/googleWorkspace.js";
import { LocalMemoryStore } from "../src/memory/localMemory.js";
import { buildSimplePdf } from "./pdfFixture.js";

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

  it("downloads and extracts bounded text from a Google Drive PDF", async () => {
    const config = buildConfig();
    await saveGoogleOAuthToken(config.googleWorkspace.tokenPath, {
      accessToken: "access-token",
      expiresAt: Date.now() + 3600_000,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"]
    });
    const requestedUrls: string[] = [];

    const fetchFn: typeof fetch = async (input) => {
      const url = input.toString();
      requestedUrls.push(url);
      if (url.includes("fields=id,name,mimeType")) {
        return jsonResponse({
          id: "pdf_123",
          name: "Outline.pdf",
          mimeType: "application/pdf"
        });
      }
      if (url.includes("alt=media")) {
        return new Response(new Uint8Array(buildSimplePdf("Chapter One Google PDF content")), {
          status: 200,
          headers: { "content-type": "application/pdf" }
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const client = await createConfiguredGoogleWorkspaceClient({ config, fetchFn });
    const doc = await client.googleDriveFileRead("pdf_123");

    expect(doc).toMatchObject({
      documentId: "pdf_123",
      title: "Outline.pdf",
      mimeType: "application/pdf",
      content: expect.stringContaining("Chapter One Google PDF content"),
      truncated: false
    });
    expect(requestedUrls.some((url) => url.includes("alt=media"))).toBe(true);
  });

  it("uses default and expanded bounds for Google Drive file reads", async () => {
    const config = buildConfig();
    await saveGoogleOAuthToken(config.googleWorkspace.tokenPath, {
      accessToken: "access-token",
      expiresAt: Date.now() + 3600_000,
      scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/documents.readonly"]
    });
    const docContent = "A".repeat(5000);

    const fetchFn: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("fields=id,name,mimeType")) {
        return jsonResponse({
          id: "doc_123",
          name: "Planning Doc",
          mimeType: "application/vnd.google-apps.document"
        });
      }
      if (url.startsWith("https://docs.googleapis.com/v1/documents/")) {
        return jsonResponse({
          title: "Planning Doc",
          body: {
            content: [
              {
                paragraph: {
                  elements: [{ textRun: { content: docContent } }]
                }
              }
            ]
          }
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const client = await createConfiguredGoogleWorkspaceClient({ config, fetchFn });
    const defaultDoc = await client.googleDriveFileRead("doc_123");
    const expandedDoc = await client.googleDriveFileRead("doc_123", { maxTextChars: 6000 });

    expect(defaultDoc.content).toHaveLength(4012);
    expect(defaultDoc.truncated).toBe(true);
    expect(expandedDoc.content).toHaveLength(5000);
    expect(expandedDoc.truncated).toBe(false);
  });

  it("continues Google Drive document reads from a text offset", async () => {
    const config = buildConfig();
    await saveGoogleOAuthToken(config.googleWorkspace.tokenPath, {
      accessToken: "access-token",
      expiresAt: Date.now() + 3600_000,
      scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/documents.readonly"]
    });
    const docContent = "Intro section. Continuation section. Final section.";

    const fetchFn: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("fields=id,name,mimeType")) {
        return jsonResponse({
          id: "doc_123",
          name: "Long Planning Doc",
          mimeType: "application/vnd.google-apps.document"
        });
      }
      if (url.startsWith("https://docs.googleapis.com/v1/documents/")) {
        return jsonResponse({
          title: "Long Planning Doc",
          body: {
            content: [
              {
                paragraph: {
                  elements: [{ textRun: { content: docContent } }]
                }
              }
            ]
          }
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const client = await createConfiguredGoogleWorkspaceClient({ config, fetchFn });
    const firstSegment = await client.googleDriveFileRead("doc_123", { maxTextChars: 14 });
    const continuedSegment = await client.googleDriveFileRead("doc_123", {
      maxTextChars: 22,
      offset: firstSegment.nextOffset
    });

    expect(firstSegment).toMatchObject({
      content: "Intro section.\n[truncated]",
      truncated: true,
      offset: 0,
      nextOffset: 14,
      totalTextChars: docContent.length
    });
    expect(continuedSegment).toMatchObject({
      content: " Continuation section.\n[truncated]",
      truncated: true,
      offset: 14,
      nextOffset: 36,
      totalTextChars: docContent.length
    });
  });

  it("clamps oversized Google Drive file read bounds to the hard cap", async () => {
    const config = buildConfig();
    await saveGoogleOAuthToken(config.googleWorkspace.tokenPath, {
      accessToken: "access-token",
      expiresAt: Date.now() + 3600_000,
      scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/documents.readonly"]
    });
    const docContent = "B".repeat(81_000);

    const fetchFn: typeof fetch = async (input) => {
      const url = input.toString();
      if (url.includes("fields=id,name,mimeType")) {
        return jsonResponse({
          id: "doc_123",
          name: "Large Doc",
          mimeType: "application/vnd.google-apps.document"
        });
      }
      if (url.startsWith("https://docs.googleapis.com/v1/documents/")) {
        return jsonResponse({
          title: "Large Doc",
          body: {
            content: [
              {
                paragraph: {
                  elements: [{ textRun: { content: docContent } }]
                }
              }
            ]
          }
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const client = await createConfiguredGoogleWorkspaceClient({ config, fetchFn });
    const doc = await client.googleDriveFileRead("doc_123", { maxTextChars: 200_000 });

    expect(doc.content).toHaveLength(80_012);
    expect(doc.truncated).toBe(true);
    expect(doc.content.endsWith("[truncated]")).toBe(true);
  });

  it("normalizes quoted Google Drive search queries before sending them to Drive", async () => {
    const config = buildConfig();
    await saveGoogleOAuthToken(config.googleWorkspace.tokenPath, {
      accessToken: "access-token",
      expiresAt: Date.now() + 3600_000,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"]
    });
    let requestedUrl = "";

    const fetchFn: typeof fetch = async (input) => {
      requestedUrl = input.toString();
      return jsonResponse({ files: [] });
    };

    const client = await createConfiguredGoogleWorkspaceClient({ config, fetchFn });
    await client.googleDriveSearch('"外部环境" “2025 年的风向”');

    const url = new URL(requestedUrl);
    expect(url.searchParams.get("q")).toBe(
      "trashed = false and (name contains '外部环境 2025 年的风向' or fullText contains '外部环境 2025 年的风向')"
    );
  });

  it("includes bounded Google error details when a Google request fails", async () => {
    const config = buildConfig();
    await saveGoogleOAuthToken(config.googleWorkspace.tokenPath, {
      accessToken: "access-token",
      expiresAt: Date.now() + 3600_000,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"]
    });

    const fetchFn: typeof fetch = async () =>
      jsonResponse(
        {
          error: {
            code: 500,
            message: "Internal backend error while processing request",
            status: "INTERNAL",
            errors: [{ reason: "backendError", message: "Backend error" }]
          }
        },
        500
      );

    const client = await createConfiguredGoogleWorkspaceClient({ config, fetchFn });
    await expect(client.googleDriveSearch("TODO")).rejects.toMatchObject({
      name: "GoogleWorkspaceRequestError",
      status: 500,
      service: "drive",
      operation: "drive.files.list",
      googleStatus: "INTERNAL",
      googleReason: "backendError",
      googleMessage: "Internal backend error while processing request"
    });
    await expect(client.googleDriveSearch("TODO")).rejects.toThrow(
      "Google Workspace request failed: drive.files.list HTTP 500 (backendError)"
    );
  });

  it("retries transient Google request failures once", async () => {
    const config = buildConfig();
    await saveGoogleOAuthToken(config.googleWorkspace.tokenPath, {
      accessToken: "access-token",
      expiresAt: Date.now() + 3600_000,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"]
    });
    let callCount = 0;

    const fetchFn: typeof fetch = async () => {
      callCount += 1;
      if (callCount === 1) {
        return jsonResponse({ error: { message: "Rate limited", errors: [{ reason: "rateLimitExceeded" }] } }, 429);
      }
      return jsonResponse({
        files: [
          {
            id: "doc_1",
            name: "TODO",
            mimeType: "application/vnd.google-apps.document"
          }
        ]
      });
    };

    const client = await createConfiguredGoogleWorkspaceClient({ config, fetchFn });
    const results = await client.googleDriveSearch("TODO");

    expect(callCount).toBe(2);
    expect(results[0]?.documentId).toBe("doc_1");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

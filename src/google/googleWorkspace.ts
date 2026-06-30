import type { AppConfig } from "../config/config.js";
import type { LocalMemoryStore } from "../memory/localMemory.js";
import { extractPdfText } from "../pdf/pdfText.js";
import {
  GOOGLE_ACCOUNT_EMAIL_SETTING_KEY,
  GOOGLE_GRANTED_SCOPES_SETTING_KEY,
  GOOGLE_PROVIDER_NAME,
  isGoogleTokenExpired,
  loadGoogleOAuthToken,
  refreshGoogleOAuthToken,
  saveGoogleOAuthToken,
  type GoogleOAuthToken
} from "./googleAuth.js";

const MAX_TEXT_CHARS = 4000;
const MAX_DRIVE_FILE_READ_TEXT_CHARS = 80_000;
const DEFAULT_MAX_RESULTS = 5;
const GOOGLE_ERROR_BODY_MAX_CHARS = 1000;
const GOOGLE_RETRY_DELAY_MS = 250;
const GOOGLE_DOC_MIME_TYPE = "application/vnd.google-apps.document";
const PDF_MIME_TYPE = "application/pdf";

export class GoogleWorkspaceRequestError extends Error {
  readonly status: number;
  readonly service: string;
  readonly operation: string;
  readonly endpoint: string;
  readonly googleStatus?: string;
  readonly googleReason?: string;
  readonly googleMessage?: string;

  constructor(input: {
    status: number;
    service: string;
    operation: string;
    endpoint: string;
    googleStatus?: string;
    googleReason?: string;
    googleMessage?: string;
  }) {
    const reason = input.googleReason ? ` (${input.googleReason})` : "";
    super(`Google Workspace request failed: ${input.operation} HTTP ${input.status}${reason}`);
    this.name = "GoogleWorkspaceRequestError";
    this.status = input.status;
    this.service = input.service;
    this.operation = input.operation;
    this.endpoint = input.endpoint;
    this.googleStatus = input.googleStatus;
    this.googleReason = input.googleReason;
    this.googleMessage = input.googleMessage;
  }
}

export type GmailSearchResult = {
  messageId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
};

export type GmailMessage = GmailSearchResult & {
  body: string;
};

export type DriveSearchResult = {
  documentId: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
};

export type GoogleDoc = {
  documentId: string;
  title: string;
  content: string;
  mimeType?: string;
  truncated?: boolean;
};

export type GoogleDriveFileReadOptions = {
  maxTextChars?: number;
};

export type GoogleWorkspaceClient = {
  gmailSearch(query: string): Promise<GmailSearchResult[]>;
  gmailReadMessage(messageId: string): Promise<GmailMessage>;
  googleDriveSearch(query: string): Promise<DriveSearchResult[]>;
  googleDocRead(documentId: string): Promise<GoogleDoc>;
  googleDriveFileRead(documentId: string, options?: GoogleDriveFileReadOptions): Promise<GoogleDoc>;
};

export type GoogleWorkspaceClientOptions = {
  config: AppConfig;
  memoryStore?: LocalMemoryStore;
  fetchFn?: typeof fetch;
};

export async function createConfiguredGoogleWorkspaceClient(
  options: GoogleWorkspaceClientOptions
): Promise<GoogleWorkspaceClient> {
  if (!options.config.googleWorkspace.enabled) {
    throw new Error("Google Workspace tools are disabled. Set GOOGLE_WORKSPACE_ENABLED=true and run `npm run agent:google:login`.");
  }

  const fetchFn = options.fetchFn ?? fetch;
  let token = await loadGoogleOAuthToken(options.config.googleWorkspace.tokenPath);
  if (isGoogleTokenExpired(token)) {
    token = await refreshGoogleOAuthToken({
      config: options.config,
      token,
      fetchFn
    });
  }

  options.memoryStore?.setProviderTokenConfigured(GOOGLE_PROVIDER_NAME, true);
  options.memoryStore?.setSetting(GOOGLE_GRANTED_SCOPES_SETTING_KEY, token.scopes.join(" "));
  if (token.accountEmail) {
    options.memoryStore?.setSetting(GOOGLE_ACCOUNT_EMAIL_SETTING_KEY, token.accountEmail);
  }

  return createGoogleWorkspaceClient({
    token,
    config: options.config,
    fetchFn
  });
}

export function createGoogleWorkspaceClient(input: {
  token: GoogleOAuthToken;
  config?: AppConfig;
  fetchFn?: typeof fetch;
}): GoogleWorkspaceClient {
  const fetchFn = input.fetchFn ?? fetch;

  async function googleFetch<T>(url: string, metadata: GoogleRequestMetadata): Promise<T> {
    let response = await fetchGoogleUrl(url);

    if (response.status === 401 && input.config && input.token.refreshToken) {
      input.token = await refreshGoogleOAuthToken({
        config: input.config,
        token: input.token,
        fetchFn
      });
      await saveGoogleOAuthToken(input.config.googleWorkspace.tokenPath, input.token);
      response = await fetchGoogleUrl(url);
    }

    if (shouldRetryGoogleRequest(response.status)) {
      await delay(GOOGLE_RETRY_DELAY_MS);
      response = await fetchGoogleUrl(url);
    }

    if (!response.ok) {
      throw await buildGoogleWorkspaceRequestError(response, url, metadata);
    }
    return (await response.json()) as T;
  }

  async function googleFetchBytes(url: string, metadata: GoogleRequestMetadata): Promise<Uint8Array> {
    let response = await fetchGoogleUrl(url);

    if (response.status === 401 && input.config && input.token.refreshToken) {
      input.token = await refreshGoogleOAuthToken({
        config: input.config,
        token: input.token,
        fetchFn
      });
      await saveGoogleOAuthToken(input.config.googleWorkspace.tokenPath, input.token);
      response = await fetchGoogleUrl(url);
    }

    if (shouldRetryGoogleRequest(response.status)) {
      await delay(GOOGLE_RETRY_DELAY_MS);
      response = await fetchGoogleUrl(url);
    }

    if (!response.ok) {
      throw await buildGoogleWorkspaceRequestError(response, url, metadata);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async function fetchGoogleUrl(url: string): Promise<Response> {
    return fetchFn(url, {
      headers: { authorization: `Bearer ${input.token.accessToken}` }
    });
  }

  return {
    async gmailSearch(query) {
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.searchParams.set("q", query);
      url.searchParams.set("maxResults", String(DEFAULT_MAX_RESULTS));
      const list = await googleFetch<{ messages?: Array<{ id: string }> }>(url.toString(), {
        service: "gmail",
        operation: "gmail.messages.list"
      });
      const messages = list.messages ?? [];
      return Promise.all(messages.map((message) => readGmailMetadata(message.id, googleFetch)));
    },

    async gmailReadMessage(messageId) {
      const message = await googleFetch<GmailApiMessage>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
        {
          service: "gmail",
          operation: "gmail.messages.get"
        }
      );
      return {
        ...formatGmailMetadata(message),
        body: truncate(extractGmailBody(message))
      };
    },

    async googleDriveSearch(query) {
      const normalizedQuery = normalizeDriveSearchQuery(query);
      const escaped = normalizedQuery.replaceAll("'", "\\'");
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("pageSize", String(DEFAULT_MAX_RESULTS));
      url.searchParams.set("q", `trashed = false and (name contains '${escaped}' or fullText contains '${escaped}')`);
      url.searchParams.set("fields", "files(id,name,mimeType,webViewLink,modifiedTime)");
      const body = await googleFetch<{ files?: DriveSearchResult[] }>(url.toString(), {
        service: "drive",
        operation: "drive.files.list"
      });
      return (body.files ?? []).map((file) => ({
        documentId: file.documentId ?? (file as unknown as { id: string }).id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        modifiedTime: file.modifiedTime
      }));
    },

    async googleDocRead(documentId) {
      const doc = await googleFetch<GoogleDocsApiDocument>(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
        {
          service: "docs",
          operation: "docs.documents.get"
        }
      );
      return {
        documentId,
        title: doc.title ?? "Untitled document",
        content: truncate(extractGoogleDocText(doc)),
        mimeType: GOOGLE_DOC_MIME_TYPE
      };
    },

    async googleDriveFileRead(documentId, options) {
      const maxTextChars = clampDriveFileReadMaxChars(options?.maxTextChars);
      const metadata = await googleFetch<GoogleDriveApiFile>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}?fields=id,name,mimeType`,
        {
          service: "drive",
          operation: "drive.files.get"
        }
      );
      if (metadata.mimeType === GOOGLE_DOC_MIME_TYPE) {
        const doc = await googleFetch<GoogleDocsApiDocument>(
          `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
          {
            service: "docs",
            operation: "docs.documents.get"
          }
        );
        const content = extractGoogleDocText(doc);
        return {
          documentId,
          title: doc.title ?? metadata.name ?? "Untitled document",
          content: truncate(content, maxTextChars),
          mimeType: metadata.mimeType,
          truncated: content.length > maxTextChars
        };
      }
      if (metadata.mimeType === PDF_MIME_TYPE) {
        const pdfBytes = await googleFetchBytes(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}?alt=media`,
          {
            service: "drive",
            operation: "drive.files.get_media"
          }
        );
        const extracted = await extractPdfText(pdfBytes, maxTextChars);
        return {
          documentId,
          title: metadata.name ?? "Untitled PDF",
          content: extracted.content,
          mimeType: metadata.mimeType,
          truncated: extracted.truncated
        };
      }
      throw new Error(`Google Drive MIME type is not readable: ${metadata.mimeType ?? "unknown"}`);
    }
  };
}

type GmailApiMessage = {
  id: string;
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: GmailApiMessage["payload"][];
  };
};

type GoogleDocsApiDocument = {
  title?: string;
  body?: {
    content?: Array<{
      paragraph?: {
        elements?: Array<{
          textRun?: {
            content?: string;
          };
        }>;
      };
    }>;
  };
};

type GoogleDriveApiFile = {
  id?: string;
  name?: string;
  mimeType?: string;
};

type GoogleRequestMetadata = {
  service: string;
  operation: string;
};

type GoogleApiErrorBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{
      message?: string;
      reason?: string;
    }>;
  };
};

async function readGmailMetadata(
  messageId: string,
  googleFetch: <T>(url: string, metadata: GoogleRequestMetadata) => Promise<T>
): Promise<GmailSearchResult> {
  const message = await googleFetch<GmailApiMessage>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    {
      service: "gmail",
      operation: "gmail.messages.get_metadata"
    }
  );
  return formatGmailMetadata(message);
}

async function buildGoogleWorkspaceRequestError(
  response: Response,
  url: string,
  metadata: GoogleRequestMetadata
): Promise<GoogleWorkspaceRequestError> {
  const errorBody = parseGoogleApiErrorBody(await boundedResponseText(response));
  const error = errorBody?.error;
  const firstError = error?.errors?.find((item) => item.reason || item.message);
  return new GoogleWorkspaceRequestError({
    status: response.status,
    service: metadata.service,
    operation: metadata.operation,
    endpoint: redactGoogleEndpoint(url),
    googleStatus: truncate(error?.status ?? "", 120) || undefined,
    googleReason: truncate(firstError?.reason ?? "", 120) || undefined,
    googleMessage: truncate(error?.message ?? firstError?.message ?? "", 300) || undefined
  });
}

async function boundedResponseText(response: Response): Promise<string> {
  try {
    return truncate(await response.text(), GOOGLE_ERROR_BODY_MAX_CHARS);
  } catch {
    return "";
  }
}

function parseGoogleApiErrorBody(text: string): GoogleApiErrorBody | undefined {
  if (!text) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const error = (parsed as { error?: unknown }).error;
    if (!error || typeof error !== "object" || Array.isArray(error)) {
      return undefined;
    }
    const typedError = error as Record<string, unknown>;
    const errors = Array.isArray(typedError.errors)
      ? typedError.errors
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
          .map((item) => ({
            message: typeof item.message === "string" ? item.message : undefined,
            reason: typeof item.reason === "string" ? item.reason : undefined
          }))
      : undefined;
    return {
      error: {
        code: typeof typedError.code === "number" ? typedError.code : undefined,
        message: typeof typedError.message === "string" ? typedError.message : undefined,
        status: typeof typedError.status === "string" ? typedError.status : undefined,
        errors
      }
    };
  } catch {
    return undefined;
  }
}

function redactGoogleEndpoint(url: string): string {
  const parsed = new URL(url);
  const redacted = new URL(`${parsed.origin}${parsed.pathname}`);
  for (const [key, value] of parsed.searchParams.entries()) {
    redacted.searchParams.append(key, key === "q" ? "[REDACTED_QUERY]" : value);
  }
  return redacted.toString();
}

function shouldRetryGoogleRequest(status: number): boolean {
  return status === 429 || status >= 500;
}

function normalizeDriveSearchQuery(query: string): string {
  return query.replace(/["“”]/g, " ").replace(/\s+/g, " ").trim();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function formatGmailMetadata(message: GmailApiMessage): GmailSearchResult {
  return {
    messageId: message.id,
    subject: findHeader(message, "Subject") || "(no subject)",
    from: findHeader(message, "From") || "(unknown sender)",
    date: findHeader(message, "Date") || "",
    snippet: truncate(message.snippet ?? "", 500)
  };
}

function findHeader(message: GmailApiMessage, name: string): string | undefined {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value;
}

function extractGmailBody(message: GmailApiMessage): string {
  const chunks: string[] = [];
  collectGmailBodyParts(message.payload, chunks);
  return chunks.join("\n").trim() || message.snippet || "";
}

function collectGmailBodyParts(part: GmailApiMessage["payload"], chunks: string[]): void {
  if (!part) {
    return;
  }
  if (part.body?.data) {
    chunks.push(decodeBase64Url(part.body.data));
  }
  for (const child of part.parts ?? []) {
    collectGmailBodyParts(child, chunks);
  }
}

function extractGoogleDocText(doc: GoogleDocsApiDocument): string {
  return (
    doc.body?.content
      ?.flatMap((item) => item.paragraph?.elements ?? [])
      .map((element) => element.textRun?.content ?? "")
      .join("") ?? ""
  ).trim();
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8");
}

function truncate(value: string, maxChars = MAX_TEXT_CHARS): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n[truncated]` : value;
}

function clampDriveFileReadMaxChars(value: number | undefined): number {
  if (value === undefined) {
    return MAX_TEXT_CHARS;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return MAX_TEXT_CHARS;
  }
  return Math.min(Math.floor(value), MAX_DRIVE_FILE_READ_TEXT_CHARS);
}

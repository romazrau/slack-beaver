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
const DEFAULT_MAX_RESULTS = 5;
const GOOGLE_DOC_MIME_TYPE = "application/vnd.google-apps.document";
const PDF_MIME_TYPE = "application/pdf";

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

export type GoogleWorkspaceClient = {
  gmailSearch(query: string): Promise<GmailSearchResult[]>;
  gmailReadMessage(messageId: string): Promise<GmailMessage>;
  googleDriveSearch(query: string): Promise<DriveSearchResult[]>;
  googleDocRead(documentId: string): Promise<GoogleDoc>;
  googleDriveFileRead(documentId: string): Promise<GoogleDoc>;
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

  async function googleFetch<T>(url: string): Promise<T> {
    let response = await fetchFn(url, {
      headers: { authorization: `Bearer ${input.token.accessToken}` }
    });

    if (response.status === 401 && input.config && input.token.refreshToken) {
      input.token = await refreshGoogleOAuthToken({
        config: input.config,
        token: input.token,
        fetchFn
      });
      await saveGoogleOAuthToken(input.config.googleWorkspace.tokenPath, input.token);
      response = await fetchFn(url, {
        headers: { authorization: `Bearer ${input.token.accessToken}` }
      });
    }

    if (!response.ok) {
      throw new Error(`Google Workspace request failed: HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async function googleFetchBytes(url: string): Promise<Uint8Array> {
    let response = await fetchFn(url, {
      headers: { authorization: `Bearer ${input.token.accessToken}` }
    });

    if (response.status === 401 && input.config && input.token.refreshToken) {
      input.token = await refreshGoogleOAuthToken({
        config: input.config,
        token: input.token,
        fetchFn
      });
      await saveGoogleOAuthToken(input.config.googleWorkspace.tokenPath, input.token);
      response = await fetchFn(url, {
        headers: { authorization: `Bearer ${input.token.accessToken}` }
      });
    }

    if (!response.ok) {
      throw new Error(`Google Workspace request failed: HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  return {
    async gmailSearch(query) {
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.searchParams.set("q", query);
      url.searchParams.set("maxResults", String(DEFAULT_MAX_RESULTS));
      const list = await googleFetch<{ messages?: Array<{ id: string }> }>(url.toString());
      const messages = list.messages ?? [];
      return Promise.all(messages.map((message) => readGmailMetadata(message.id, googleFetch)));
    },

    async gmailReadMessage(messageId) {
      const message = await googleFetch<GmailApiMessage>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`
      );
      return {
        ...formatGmailMetadata(message),
        body: truncate(extractGmailBody(message))
      };
    },

    async googleDriveSearch(query) {
      const escaped = query.replaceAll("'", "\\'");
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("pageSize", String(DEFAULT_MAX_RESULTS));
      url.searchParams.set("q", `trashed = false and (name contains '${escaped}' or fullText contains '${escaped}')`);
      url.searchParams.set("fields", "files(id,name,mimeType,webViewLink,modifiedTime)");
      const body = await googleFetch<{ files?: DriveSearchResult[] }>(url.toString());
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
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`
      );
      return {
        documentId,
        title: doc.title ?? "Untitled document",
        content: truncate(extractGoogleDocText(doc)),
        mimeType: GOOGLE_DOC_MIME_TYPE
      };
    },

    async googleDriveFileRead(documentId) {
      const metadata = await googleFetch<GoogleDriveApiFile>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}?fields=id,name,mimeType`
      );
      if (metadata.mimeType === GOOGLE_DOC_MIME_TYPE) {
        const doc = await googleFetch<GoogleDocsApiDocument>(
          `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`
        );
        return {
          documentId,
          title: doc.title ?? metadata.name ?? "Untitled document",
          content: truncate(extractGoogleDocText(doc)),
          mimeType: metadata.mimeType
        };
      }
      if (metadata.mimeType === PDF_MIME_TYPE) {
        const pdfBytes = await googleFetchBytes(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}?alt=media`
        );
        const extracted = await extractPdfText(pdfBytes, MAX_TEXT_CHARS);
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

async function readGmailMetadata(
  messageId: string,
  googleFetch: <T>(url: string) => Promise<T>
): Promise<GmailSearchResult> {
  const message = await googleFetch<GmailApiMessage>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
  );
  return formatGmailMetadata(message);
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

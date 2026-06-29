import type { AgentToolCallResult } from "./toolRegistry.js";

export type EvidenceItem = {
  sourceType: "local_file" | "gmail" | "google_drive_file" | "unknown";
  title: string;
  locator: string;
  snippet?: string;
  contentPreview?: string;
  toolName: AgentToolCallResult["name"];
};

export type EvidenceLedger = {
  items: EvidenceItem[];
};

export function buildEvidenceLedger(toolOutputs: AgentToolCallResult[]): EvidenceLedger {
  return {
    items: toolOutputs.flatMap((output) => parseToolOutput(output)).slice(0, 20)
  };
}

export function summarizeEvidenceLedger(ledger: EvidenceLedger): string {
  if (ledger.items.length === 0) {
    return "No evidence items were gathered.";
  }
  return ledger.items
    .map((item, index) =>
      [
        `Evidence ${index + 1}:`,
        `Source type: ${item.sourceType}`,
        `Title: ${item.title}`,
        `Locator: ${item.locator}`,
        item.snippet ? `Snippet: ${item.snippet}` : undefined,
        item.contentPreview ? `Content preview: ${item.contentPreview}` : undefined
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

function parseToolOutput(output: AgentToolCallResult): EvidenceItem[] {
  try {
    const parsed = JSON.parse(output.output) as Record<string, unknown>;
    if (Array.isArray(parsed.results)) {
      return parsed.results.flatMap((result) => parseSearchResult(output.name, result));
    }
    if (parsed.file && typeof parsed.file === "object") {
      const file = parsed.file as Record<string, unknown>;
      return [
        {
          sourceType: "local_file",
          title: stringOrFallback(file.filename, "Local file"),
          locator: stringOrFallback(file.path, "unknown path"),
          contentPreview: truncate(stringOrFallback(file.content, ""), 500),
          toolName: output.name
        }
      ];
    }
    if (parsed.message && typeof parsed.message === "object") {
      const message = parsed.message as Record<string, unknown>;
      return [
        {
          sourceType: "gmail",
          title: stringOrFallback(message.subject, "Gmail message"),
          locator: stringOrFallback(message.messageId, "unknown message"),
          contentPreview: truncate(stringOrFallback(message.bodyText, stringOrFallback(message.snippet, "")), 500),
          toolName: output.name
        }
      ];
    }
    if (parsed.document && typeof parsed.document === "object") {
      const document = parsed.document as Record<string, unknown>;
      return [
        {
          sourceType: "google_drive_file",
          title: stringOrFallback(document.title, "Google Doc"),
          locator: stringOrFallback(document.documentId, "unknown document"),
          contentPreview: truncate(stringOrFallback(document.content, stringOrFallback(document.text, "")), 500),
          toolName: output.name
        }
      ];
    }
  } catch {
    return [];
  }
  return [];
}

function parseSearchResult(toolName: AgentToolCallResult["name"], result: unknown): EvidenceItem[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return [];
  }
  const record = result as Record<string, unknown>;
  if (toolName === "local_search") {
    return [
      {
        sourceType: "local_file",
        title: stringOrFallback(record.filename, "Local file"),
        locator: stringOrFallback(record.path, "unknown path"),
        snippet: truncate(stringOrFallback(record.snippet, ""), 300),
        toolName
      }
    ];
  }
  if (toolName === "gmail_search") {
    return [
      {
        sourceType: "gmail",
        title: stringOrFallback(record.subject, "Gmail message"),
        locator: stringOrFallback(record.messageId, "unknown message"),
        snippet: truncate(stringOrFallback(record.snippet, ""), 300),
        toolName
      }
    ];
  }
  if (toolName === "google_drive_search") {
    return [
      {
        sourceType: "google_drive_file",
        title: stringOrFallback(record.name, "Google Drive item"),
        locator: stringOrFallback(record.documentId, "unknown document"),
        snippet: truncate(stringOrFallback(record.mimeType, ""), 300),
        toolName
      }
    ];
  }
  return [];
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function truncate(value: string, maxLength: number): string | undefined {
  if (!value.trim()) {
    return undefined;
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

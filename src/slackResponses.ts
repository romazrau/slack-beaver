import type { SearchResult } from "./localSearch.js";

export type AgentCommand =
  | { type: "find"; query: string }
  | { type: "invalid"; reason: string };

export function parseAgentCommand(text: string): AgentCommand {
  const trimmed = text.trim();
  if (!trimmed) {
    return { type: "invalid", reason: "Usage: /agent find <query>" };
  }

  const [command, ...rest] = trimmed.split(/\s+/);
  if (command !== "find") {
    return { type: "invalid", reason: "Unsupported command. Usage: /agent find <query>" };
  }

  const query = rest.join(" ").trim();
  if (!query) {
    return { type: "invalid", reason: "Search query cannot be empty. Usage: /agent find <query>" };
  }

  return { type: "find", query };
}

export function formatSearchResponse(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No local files matched \`${escapeInlineCode(query)}\` in the configured watched folders.`;
  }

  const lines = results.map((result, index) => {
    return [
      `${index + 1}. *${escapeSlackText(result.filename)}*`,
      `   Path: \`${escapeInlineCode(result.path)}\``,
      `   Match: ${result.matchType}`,
      `   Snippet: ${escapeSlackText(result.snippet)}`
    ].join("\n");
  });

  return [`Found ${results.length} local file match(es) for \`${escapeInlineCode(query)}\`:`, ...lines].join(
    "\n"
  );
}

export function formatErrorResponse(message: string): string {
  return `Local file search failed: ${escapeSlackText(message)}`;
}

function escapeSlackText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeInlineCode(value: string): string {
  return escapeSlackText(value).replaceAll("`", "'");
}

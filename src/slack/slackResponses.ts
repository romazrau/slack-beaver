import type { SearchResult } from "../search/localSearch.js";

export type AgentCommand =
  | { type: "find"; query: string }
  | { type: "ask"; question: string }
  | { type: "invalid"; reason: string };

export function parseAgentCommand(text: string): AgentCommand {
  const trimmed = text.trim();
  if (!trimmed) {
    return { type: "invalid", reason: formatUsage() };
  }

  const [command, ...rest] = trimmed.split(/\s+/);
  if (command !== "find" && command !== "ask") {
    return { type: "invalid", reason: `Unsupported command. ${formatUsage()}` };
  }

  const value = rest.join(" ").trim();
  if (!value) {
    return {
      type: "invalid",
      reason:
        command === "find"
          ? "Search query cannot be empty. Usage: /agent find <query>"
          : "Question cannot be empty. Usage: /agent ask <question>"
    };
  }

  return command === "find" ? { type: "find", query: value } : { type: "ask", question: value };
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
  return `Local agent failed: ${escapeSlackText(message)}`;
}

export function formatAgentAnswerResponse(answer: string): string {
  return escapeSlackText(answer);
}

export function formatLocalAgentOfflineResponse(): string {
  return [
    "Slack Beaver Local Agent is not reachable from this Slack conversation.",
    "Start the Local Agent on the configured computer with `npm run dev`, then try again."
  ].join("\n");
}

function formatUsage(): string {
  return "Usage: /agent find <query> or /agent ask <question>";
}

function escapeSlackText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeInlineCode(value: string): string {
  return escapeSlackText(value).replaceAll("`", "'");
}

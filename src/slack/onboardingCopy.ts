export function formatSetupChecklist(): string {
  return [
    "*Setup checklist*",
    "1. Add folders I may read: `npm run agent:folders:add -- /absolute/path/to/folder`",
    "2. Check saved folders: `npm run agent:folders:list`",
    "3. Add OpenAI token locally: `npm run agent:secrets:set-openai`",
    "4. Return to Slack and type `find <query>`.",
    "After folders and token are configured, the AI agent can be enabled in the next phase."
  ].join("\n");
}

export function formatNoFoldersGuidance(): string {
  return [
    "I am initialized, but I do not have permission to read any local folders yet.",
    formatSetupChecklist(),
    "I cannot accept folder permission or API tokens directly in Slack; run the commands on this computer."
  ].join("\n\n");
}

export function formatResetMemorySlackGuidance(): string {
  return [
    "Reset is protected and must be done on this computer.",
    "I will not delete local memory from a Slack message.",
    "",
    "To initialize me again, run:",
    "`npm run agent:memory:reset -- --confirm RESET_LOCAL_MEMORY --yes`",
    "",
    "This clears allowed folders, settings, conversation state, tool-call records, and provider setup metadata from the local SQLite DB. Token files are kept.",
    "",
    "After reset, I will ask you to set folders and the OpenAI token again before the AI agent can be enabled."
  ].join("\n");
}

export function formatTokenRefusalGuidance(): string {
  return [
    "I cannot accept API keys or paid tokens in Slack.",
    "Please set the OpenAI token locally on this computer:",
    "`npm run agent:secrets:set-openai`",
    "After the token is saved and at least one folder is allowed, the AI agent can be enabled in the next phase."
  ].join("\n");
}

export function formatResetRefusalGuidance(): string {
  return [
    "Reset is blocked until you confirm it explicitly.",
    "",
    "This protects your saved folder permissions and setup state.",
    "To initialize the bot again, run exactly:",
    "`npm run agent:memory:reset -- --confirm RESET_LOCAL_MEMORY --yes`",
    "",
    "This clears allowed folders, settings, conversation state, tool-call records, and provider setup metadata from the local SQLite DB. Token files are kept."
  ].join("\n");
}

export function formatResetCompletedGuidance(counts: {
  allowedFolders: number;
  settings: number;
  conversations: number;
  toolCalls: number;
  providerConfig: number;
}): string {
  return [
    "Local memory has been reset. The bot is initialized again.",
    "",
    `Cleared records: allowed_folders=${counts.allowedFolders}, settings=${counts.settings}, conversations=${counts.conversations}, tool_calls=${counts.toolCalls}, provider_config=${counts.providerConfig}.`,
    "Token files were not deleted.",
    "",
    formatSetupChecklist()
  ].join("\n");
}

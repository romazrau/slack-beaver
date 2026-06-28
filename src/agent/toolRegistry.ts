import type { AgentCommandSource } from "./agentCommands.js";
import type { AppConfig } from "../config/config.js";
import { LocalMemoryStore } from "../memory/localMemory.js";
import { searchLocalFiles, type SearchResult } from "../search/localSearch.js";

export type ToolExecutionContext = {
  source: AgentCommandSource;
  config: AppConfig;
  memoryStore?: LocalMemoryStore;
};

export async function runLocalSearchTool(
  query: string,
  context: ToolExecutionContext
): Promise<SearchResult[]> {
  const results = await searchLocalFiles(query, context.config.localFiles);
  context.memoryStore?.recordToolCall({
    source: context.source,
    toolName: "local_search",
    inputSummary: `query length=${query.length}`,
    outputSummary: `result count=${results.length}`,
    status: "success"
  });
  return results;
}

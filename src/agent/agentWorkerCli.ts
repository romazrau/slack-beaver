import "dotenv/config";
import { loadConfig } from "../config/config.js";
import {
  buildAgentWorkerConfig,
  createLocalAgentTaskExecutor,
  getCenterServerUrl,
  runAgentWorkerOnce
} from "./agentWorker.js";
import { HttpCenterAgentTaskClient } from "./centerTaskClient.js";

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "once";
  if (mode !== "once") {
    throw new Error("Usage: npm run agent:worker -- once");
  }

  const config = loadConfig(process.env, { requireSlackTokens: false });
  const worker = buildAgentWorkerConfig();
  const client = new HttpCenterAgentTaskClient(getCenterServerUrl());
  const result = await runAgentWorkerOnce({
    client,
    worker,
    executor: createLocalAgentTaskExecutor({ config })
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

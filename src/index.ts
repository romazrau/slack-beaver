import "dotenv/config";
import { loadConfig } from "./config/config.js";
import { LocalMemoryStore } from "./memory/localMemory.js";
import { formatMissingAiAgentTokenStartupGuidance } from "./setup/startupGuidance.js";
import {
  createSlackApp,
  recordLocalAgentRuntimeHeartbeat,
  sendLocalAgentRuntimeNotice
} from "./slack/slackApp.js";
import { registerGracefulShutdownHandlers } from "./slack/gracefulShutdown.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.slack.socketModeEnabled) {
    console.log("Slack Socket Mode disabled. Configuration loaded successfully.");
    return;
  }

  const app = createSlackApp(config);
  recordLocalAgentRuntimeHeartbeat(config);
  await app.start();
  console.log("Slack Beaver Local Agent is running with Slack Socket Mode.");
  registerGracefulShutdownHandlers({
    app,
    config,
    sendRuntimeNotice: sendLocalAgentRuntimeNotice,
    logger: console
  });
  await sendLocalAgentRuntimeNotice({
    app,
    config,
    kind: "online",
    logger: console
  });
  if (!isAiAgentTokenConfigured(config)) {
    console.warn(formatMissingAiAgentTokenStartupGuidance());
  }
}

function isAiAgentTokenConfigured(config: ReturnType<typeof loadConfig>): boolean {
  if (!config.localMemory.enabled) {
    return false;
  }

  const store = new LocalMemoryStore(config.localMemory.dbPath);
  try {
    return store.getProviderConfig("openai")?.tokenConfigured ?? false;
  } finally {
    store.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

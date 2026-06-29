import "dotenv/config";
import { loadConfig } from "./config/config.js";
import { LocalMemoryStore } from "./memory/localMemory.js";
import {
  checkGoogleWorkspaceStartupConnection,
  formatGoogleWorkspaceStartupGuidance,
  formatMissingAiAgentTokenStartupGuidance,
  recordGoogleWorkspaceStartupCheck
} from "./setup/startupGuidance.js";
import {
  createSlackApp,
  recordLocalAgentRuntimeHeartbeat,
  sendLocalAgentRuntimeNotice
} from "./slack/slackApp.js";
import { registerGracefulShutdownHandlers } from "./slack/gracefulShutdown.js";
import { buildRuntimeStatusSnapshot } from "./slack/runtimeStatus.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.slack.socketModeEnabled) {
    console.log("Slack Socket Mode disabled. Configuration loaded successfully.");
    return;
  }

  const app = createSlackApp(config);
  recordLocalAgentRuntimeHeartbeat(config);
  const googleWorkspaceCheck = await checkGoogleWorkspaceStartupConnection(config);
  recordGoogleWorkspaceStartupCheck(config, googleWorkspaceCheck);
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
  await sendStartupGuidanceNotice({
    app,
    config,
    text: formatGoogleWorkspaceStartupGuidance(googleWorkspaceCheck),
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

async function sendStartupGuidanceNotice(input: {
  app: ReturnType<typeof createSlackApp>;
  config: ReturnType<typeof loadConfig>;
  text: string | undefined;
  logger: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
}): Promise<void> {
  if (!input.text) {
    return;
  }

  input.logger.warn?.(input.text);
  const target = buildRuntimeStatusSnapshot(input.config).noticeTarget;
  if (!target.channelId) {
    input.logger.warn?.(
      "No Slack startup guidance notice target configured. Set LOCAL_AGENT_STATUS_CHANNEL_ID or send `status subscribe`."
    );
    return;
  }

  try {
    await input.app.client.chat.postMessage({
      channel: target.channelId,
      text: input.text
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Slack notice error";
    input.logger.error?.(`Unable to send startup guidance notice: ${message}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

import "dotenv/config";
import { loadConfig } from "./config.js";
import { createSlackApp } from "./slackApp.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.slack.socketModeEnabled) {
    console.log("Slack Socket Mode disabled. Configuration loaded successfully.");
    return;
  }

  const app = createSlackApp(config);
  await app.start();
  console.log("Slack Beaver Local Agent is running with Slack Socket Mode.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

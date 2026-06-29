#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const mode = process.argv[2];
const repoRoot = path.resolve(__dirname, "..");
const fixturePath = process.env.UAT_FOLDER || path.join(repoRoot, "doc-test");
const setupDoc = "docs/setup/slack-api-and-local-runtime.md";
const quickGuide = "docs/runbooks/quick-uat-start.md";
const dryRun = process.env.UAT_DRY_RUN === "true";

if (!["first", "resume", "reset"].includes(mode)) {
  console.error("Usage: node scripts/uat-start.cjs <first|resume|reset>");
  process.exit(1);
}

main();

function main() {
  console.log(`Slack Beaver UAT startup: ${mode}`);
  console.log(`Guide: ${quickGuide}`);

  run("npm", ["run", "check:node"]);

  if (mode === "first") {
    firstStartup();
    return;
  }

  if (mode === "resume") {
    resumeStartup();
    return;
  }

  resetStartup();
}

function firstStartup() {
  console.log("");
  console.log("First startup requires local Slack tokens, local folders, and the AI agent token.");
  console.log(`Read setup first: ${setupDoc}`);
  console.log("Never paste Slack tokens or OpenAI API keys into Slack.");

  if (!fs.existsSync(path.join(repoRoot, ".env"))) {
    console.log("");
    console.log("Missing .env. Create it from .env.example, add Slack tokens, then rerun:");
    console.log("  cp .env.example .env");
    console.log("  npm run uat:first");
    process.exit(1);
  }

  assertEnvKeys(["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"]);
  ensureDependencies();
  ensureFolder(fixturePath);
  run("npm", ["run", "agent:folders:add", "--", fixturePath]);

  console.log("");
  console.log("If the AI agent token is not configured yet, run this in another terminal:");
  console.log("  npm run agent:secrets:set-openai");
  console.log("");
  console.log("Starting Local Agent. Stop with Ctrl-C.");
  run("npm", ["run", "dev"], { inherit: true });
}

function resumeStartup() {
  assertEnvFile();
  ensureDependencies();
  runOptional("npm", ["run", "agent:folders:list"]);
  runOptional("npm", ["run", "agent:models:current"]);
  runOptional("npm", ["run", "agent:google:status"]);

  console.log("");
  console.log("Starting Local Agent. Stop with Ctrl-C.");
  run("npm", ["run", "dev"], { inherit: true });
}

function resetStartup() {
  assertEnvFile();
  ensureDependencies();

  console.log("");
  console.log("Resetting local memory. Token files and .env are kept.");
  run("npm", [
    "run",
    "agent:memory:reset",
    "--",
    "--confirm",
    "RESET_LOCAL_MEMORY",
    "--yes"
  ]);

  ensureFolder(fixturePath);
  run("npm", ["run", "agent:folders:add", "--", fixturePath]);

  console.log("");
  console.log("If ask <question> reports missing AI setup, run:");
  console.log("  npm run agent:secrets:set-openai");
  console.log("");
  console.log("Starting Local Agent. Stop with Ctrl-C.");
  run("npm", ["run", "dev"], { inherit: true });
}

function assertEnvFile() {
  if (dryRun) {
    return;
  }
  if (!fs.existsSync(path.join(repoRoot, ".env"))) {
    console.error(`Missing .env. See ${setupDoc}.`);
    process.exit(1);
  }
}

function assertEnvKeys(keys) {
  assertEnvFile();
  const envText = fs.readFileSync(path.join(repoRoot, ".env"), "utf8");
  const missing = keys.filter((key) => !new RegExp(`^${key}=.+`, "m").test(envText));
  if (missing.length > 0) {
    console.error(`Missing required .env setting(s): ${missing.join(", ")}`);
    console.error(`See ${setupDoc}.`);
    process.exit(1);
  }
}

function ensureDependencies() {
  if (dryRun) {
    return;
  }
  if (!fs.existsSync(path.join(repoRoot, "node_modules"))) {
    console.log("");
    console.log("Installing dependencies...");
    run("npm", ["install"], { inherit: true });
  }
}

function ensureFolder(folderPath) {
  if (dryRun) {
    return;
  }
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    console.error(`UAT folder is not available: ${folderPath}`);
    console.error("Set UAT_FOLDER=/absolute/path/to/folder or create the fixture folder.");
    process.exit(1);
  }
}

function runOptional(command, args) {
  if (dryRun) {
    console.log(`Dry run: would run \`${[command, ...args].join(" ")}\`.`);
    return;
  }

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe"
  });

  const text = [result.stdout, result.stderr].filter(Boolean).join("");
  if (text.trim()) {
    console.log(text.trim());
  }
}

function run(command, args, options = {}) {
  if (dryRun && !(command === "npm" && args.join(" ") === "run check:node")) {
    if (command === "npm" && args.join(" ") === "run dev") {
      console.log("Dry run: would start Local Agent with `npm run dev`.");
      return;
    }
    console.log(`Dry run: would run \`${[command, ...args].join(" ")}\`.`);
    return;
  }

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: options.inherit ? "inherit" : "pipe",
    encoding: "utf8"
  });

  if (!options.inherit) {
    const text = [result.stdout, result.stderr].filter(Boolean).join("");
    if (text.trim()) {
      console.log(text.trim());
    }
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

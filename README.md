# Slack Beaver

Slack Beaver is a local-first Slack agent. Slack is the control surface, and the Local Agent process runs on the user's computer to search allowlisted local files, answer questions through guarded tools, and write audit logs.

## Start The Server

Use Node.js 22 before installing dependencies. The project uses native SQLite bindings through `better-sqlite3`, so `node_modules` must be installed or rebuilt with the same Node major version used to run the Local Agent.

```sh
nvm use
node -v
```

Project npm scripts check this before loading native SQLite bindings. If a terminal has drifted to another Node major version, run `nvm use` before retrying the command.

Install dependencies:

```sh
npm install
```

If Node was changed after dependencies were installed, rebuild the native SQLite binding before starting:

```sh
npm rebuild better-sqlite3
```

Create a local `.env` with Slack Socket Mode tokens and local runtime settings. Do not commit token values. See [Slack API And Local Runtime Setup](docs/setup/slack-api-and-local-runtime.md) for the required Slack app settings and environment variables.

Start the Local Agent:

```sh
npm run dev
```

## Enable AI Answers

`find <query>` works with allowed local folders. `ask <question>` and natural App DM conversation also need an AI agent token configured locally.

The AI agent token is an OpenAI API key stored on this computer. Never paste API keys or paid tokens into Slack.
For model discovery and switching, the key needs `List models: Read`; for answers, it needs `Responses: Write` for the selected model.

```sh
npm run agent:secrets:set-openai
```

This local setup command can run before Slack tokens are configured.

The default model is `gpt-5.5`. You can inspect and change the active model locally:

```sh
npm run agent:models:current
npm run agent:models:list
npm run agent:models:set -- gpt-5.5
```

After the local prompt saves the token and the Local Agent is running, return to the Slack app Messages tab and type:

```text
ask What does the deployment checklist say?
```

Run the main verification gate:

```sh
npm run verify
```

Useful local setup commands:

```sh
npm run agent:folders:add -- /absolute/path/to/folder
npm run agent:folders:list
npm run agent:folders:remove -- /absolute/path/to/folder
npm run agent:secrets:set-openai
npm run agent:models:current
npm run agent:models:list
npm run agent:models:set -- gpt-5.5
```

## Current Features

- Slack Socket Mode Local Agent runtime.
- `/agent find <query>` slash command for read-only local file search.
- Slack App Home and Messages tab support for `find <query>`, `ask <question>`, and natural App DM conversation.
- Allowlisted local folder search for Markdown, text, CSV, and JSON-style local files.
- Denylist and max-file-size guards for local file access.
- SQLite local memory for enabled folders, provider setup metadata, conversation turns, summaries, and tool-call summaries.
- Local-only OpenAI token setup through CLI; token-like Slack messages are refused.
- Local-only OpenAI model discovery and switching through CLI.
- Guarded OpenAI-backed `ask <question>` flow that can only call the registered `local_search` tool.
- Bounded App DM conversation context with 8 full turns before summarization, then one summary plus the latest 4 full turns.
- JSONL audit log for successful and failed searchable tool activity.
- Synthetic local-search fixtures under `doc-test/` for manual validation.

## Documentation Index

- [Slack API And Local Runtime Setup](docs/setup/slack-api-and-local-runtime.md): Slack app settings, local `.env`, CLI setup, secret handling, and optional daemon notes.
- [Slack Local File Search v0 Runbook](docs/runbooks/slack-local-file-search-v0.md): repeatable demo, manual UAT, audit inspection, and cleanup checklist.
- [POC Plan](docs/repo-goal/00-poc.md): product scope, architecture reasoning, phase plan, and acceptance criteria.
- [Accelerated Local File Search](docs/repo-goal/01-accelerated-local-file-search.md): v0 runtime decision and narrowed local-search phase.
- [Facts And Hardening](docs/repo-goal/02-v0-facts-and-hardening.md): hardening plan, UAT gaps, and runbook readiness.
- [Local Memory And AI Agent](docs/repo-goal/03-local-memory-and-ai-agent.md): local memory, token safety, and tool guardrails.
- [OpenAI Agent Runner](docs/repo-goal/04-openai-agent-runner.md): guarded `ask <question>` implementation plan.
- [Agent Conversation Context And Tool Catalog](docs/repo-goal/05-agent-conversation-context-and-tools.md): planned App DM natural conversation, tool catalog, and context summarization behavior.
- [Agent Token Onboarding](docs/repo-goal/06-agent-token-onboarding.md): user-facing local-only AI agent token setup guidance.
- [OpenAI Model Selection](docs/repo-goal/07-openai-model-selection.md): local CLI model discovery, selected model storage, and validation criteria.
- [Project Memory](docs/memory/index.md): implementation decisions, progress notes, validation history, and likely next work.
- [Agent Instructions](AGENTS.md): repository workflow, testing, documentation, and collaboration rules.

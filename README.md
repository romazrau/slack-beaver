# Slack Beaver

Slack Beaver is a local-first Slack agent. Slack is the control surface, and the Local Agent process runs on the user's computer to search allowlisted local files, answer questions through guarded tools, and write audit logs.

## Start The Server

Install dependencies:

```sh
npm install
```

Create a local `.env` with Slack Socket Mode tokens and local runtime settings. Do not commit token values. See [Slack API And Local Runtime Setup](docs/setup/slack-api-and-local-runtime.md) for the required Slack app settings and environment variables.

Start the Local Agent:

```sh
npm run dev
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
```

## Current Features

- Slack Socket Mode Local Agent runtime.
- `/agent find <query>` slash command for read-only local file search.
- Slack App Home and Messages tab support for `find <query>` and `ask <question>`.
- Allowlisted local folder search for Markdown, text, CSV, and JSON-style local files.
- Denylist and max-file-size guards for local file access.
- SQLite local memory for enabled folders, provider setup metadata, conversations, and tool-call summaries.
- Local-only OpenAI token setup through CLI; token-like Slack messages are refused.
- Guarded OpenAI-backed `ask <question>` flow that can only call the registered `local_search` tool.
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
- [Project Memory](docs/memory/index.md): implementation decisions, progress notes, validation history, and likely next work.
- [Agent Instructions](AGENTS.md): repository workflow, testing, documentation, and collaboration rules.

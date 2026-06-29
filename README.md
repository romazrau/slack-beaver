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

When the Local Agent starts, it records a local runtime heartbeat in SQLite. The Slack App Home tab shows whether that heartbeat is online, stale, or not seen yet. Startup and graceful shutdown also send best-effort Slack lifecycle notices when a target is configured through `LOCAL_AGENT_STATUS_CHANNEL_ID`, `status subscribe`, or a remembered recent conversation.

The fixed offline guidance is:

```text
Slack Beaver Local Agent is not reachable from this Slack conversation.
Start the Local Agent on the configured computer with `npm run dev`, then try again.
```

In the current architecture, Slack Socket Mode ingress runs inside the Local Agent process. If that process is fully stopped, Slack events are not received by this repo until the process starts again. A fully automatic Slack reply while the Local Agent is down requires a future always-on Center Server or another Slack ingress service.

## Manage Readable Folders From Slack

`WATCHED_FOLDERS` in `.env` is the bootstrap readable scope. While the Local Agent is running, users can inspect and extend the readable scope from Slack App DM or `/agent`:

```text
folders list
folders add /absolute/path/to/folder
confirm folders add /absolute/path/to/folder
folders remove /absolute/path/to/folder
status
status subscribe
```

Slack-added folders are validated locally, saved in SQLite `allowed_folders`, and merged with `WATCHED_FOLDERS` for search and read tools. Env-provided folders remain controlled by `.env` and cannot be removed from Slack.

Natural App DM conversation can explain these runtime commands and sees the same non-secret runtime context used by startup/status notices, including configured readable folders, AI agent token setup state, Google Workspace setup state, lifecycle notice target, and available commands. Folder access changes still require an explicit deterministic command, such as `folders add /absolute/path/to/folder`, or the explicit confirmation form `confirm folders add /absolute/path/to/folder`.

Quick manual UAT startup:

```sh
npm run uat:first
npm run uat:resume
npm run uat:reset
```

Start the Center Server TODO API:

```sh
npm run center:dev
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

Typed retrieval planning is enabled by default for AI answers loaded through normal config. It asks a planner model role for a validated JSON plan, executes approved tool steps through deterministic code and Tool Registry, drafts from the gathered evidence, and sends the draft through the reviewer role. To temporarily return to the legacy tool loop while debugging, set:

```env
TYPED_AGENT_WORKFLOW_ENABLED=false
```

After the local prompt saves the token and the Local Agent is running, return to the Slack app Messages tab and type:

```text
ask What does the deployment checklist say?
```

## Enable Google Workspace Search

Google Workspace search is optional and read-only in this version. Configure a Google OAuth client for a local app, set these local environment variables, then complete browser login on this computer:

```env
GOOGLE_WORKSPACE_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_TOKEN_PATH=./tokens/google-oauth.json
GOOGLE_OAUTH_REDIRECT_HOST=127.0.0.1
```

```sh
npm run agent:google:login
npm run agent:google:status
npm run agent:google:logout
```

The Google token file stays under `GOOGLE_TOKEN_PATH` with owner-only permissions. Slack Beaver records only provider status, granted scopes, and account email in SQLite. The agent can use registered read-only Gmail, Google Drive, and Google Docs tools when Google Workspace is enabled and connected.

## Local Agent Logs

Slack Beaver writes local JSONL logs for audit and debugging. `logs/audit.jsonl` records searchable activity summaries. AI workflow events are written under `logs/agent-events/YYYY-MM-DD.jsonl` with `traceId`, `turnId`, `conversationId`, Slack channel/user metadata when available, agent role, event name, and IO summary. This makes a Slack screenshot timestamp traceable to nearby local agent events.

Event log detail is configurable:

```env
AGENT_EVENT_LOG_MODE=summary
AGENT_EVENT_LOG_RETENTION_DAYS=14
AGENT_FULL_DEBUG_LOG_RETENTION_DAYS=3
```

`summary` is the default. `trace` includes structured planner/reviewer JSON, tool inputs, bounded previews, and source locators. `full_local_debug` is local-only diagnosis mode for fuller payloads and should be kept short-lived. Logs still redact likely tokens, secrets, and private key material before writing.

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
npm run agent:google:login
npm run agent:google:status
npm run agent:google:logout
npm run center:tasks:list
npm run center:tasks:create -- --title "Follow up" --created-by U123 --owner U456
npm run center:tasks:update -- --id 1 --status done
npm run center:agents:register -- --agent-id local-1 --owner U123
npm run center:agent-tasks:create -- --question "What changed?" --created-by U123 --owner U123
npm run center:agent-tasks:list
npm run center:agent-tasks:claim -- --agent-id local-1
npm run agent:worker -- once
```

## Project Areas

The repository now has a hybrid Local Server plus Center Server foundation:

- [Local Server](projects/local-server/README.md): current Slack Socket Mode Local Agent for local files, local credentials, guarded AI tools, and Slack replies.
- [Center Server](projects/center-server/README.md): central HTTP runtime for TODO management and the first remote agent task dispatch slice.
- [Center Server DB](projects/center-server-db/README.md): central TODO and agent task persistence module, starting with SQLite.

## Current Features

- Slack Socket Mode Local Agent runtime.
- Local runtime heartbeat status in Slack App Home, with shared fixed offline guidance for unavailable-agent cases.
- `/agent find <query>` slash command for read-only local file search.
- Slack App Home and Messages tab support for `find <query>`, `ask <question>`, `folders list/add/remove`, `status`, `status subscribe`, and natural App DM conversation.
- Allowlisted local folder search for Markdown, text, CSV, and JSON-style local files.
- Denylist and max-file-size guards for local file access.
- SQLite local memory for enabled folders, provider setup metadata, conversation turns, summaries, and tool-call summaries.
- Best-effort Local Agent online/offline Slack lifecycle notices with env, subscribed, or recent-conversation targets.
- Natural App DM runtime context that lets the agent explain current readable folders, setup status, and explicit folder-add confirmation commands without silently changing folder access.
- Local-only OpenAI token setup through CLI; token-like Slack messages are refused.
- Local-only OpenAI model discovery and switching through CLI.
- Local-only Google OAuth login/status/logout through CLI for read-only Gmail, Drive, and Docs tools.
- Guarded OpenAI-backed `ask <question>` flow that can only call registered Tool Registry tools.
- Typed planner, deterministic executor, evidence ledger, and reviewer workflow for AI retrieval answers when `TYPED_AGENT_WORKFLOW_ENABLED` is true.
- Read-only local file content tool for bounded follow-up reads after local search.
- Retrieval answers from `ask <question>` and natural App DM are reviewed before Slack delivery when tool context was used; subjective short-passage requests ask a focused clarification before searching and short follow-up answers are carried back into the original request.
- Agent workflow event logs are written under ignored `logs/agent-events/` JSONL files with local time, Slack correlation metadata, planner/executor/reviewer events, and redacted or bounded IO summaries.
- Agent loop trace logs are written under ignored `logs/agent-traces/` JSONL files with tool-call inputs, bounded result summaries, fallback reasons, and reviewer decisions for local debugging.
- Repeated model-requested tool calls are stopped and answered from the last bounded tool output when possible.
- Bounded App DM conversation context with 8 full turns before summarization, then one summary plus the latest 4 full turns.
- Center Server TODO API for creating, listing, fetching, and updating centrally stored TODOs.
- Center Server remote agent task queue with Local Agent registration, heartbeat, claim leases, and a one-shot worker mode for `answer_question` tasks.
- JSONL audit log for successful and failed searchable tool activity.
- Synthetic local-search fixtures under `doc-test/` for manual validation.

## Documentation Index

- [Slack API And Local Runtime Setup](docs/setup/slack-api-and-local-runtime.md): Slack app settings, local `.env`, CLI setup, secret handling, and optional daemon notes.
- [Quick UAT Start Guide](docs/runbooks/quick-uat-start.md): first startup, resume startup, and reset-state startup paths for manual UAT.
- [Slack Local File Search v0 Runbook](docs/runbooks/slack-local-file-search-v0.md): repeatable demo, manual UAT, audit inspection, and cleanup checklist.
- [Reproducible POC Demo Plan](docs/reproducible-demo/README.md): dedicated repeatable demo plan for Slack local-agent operation, Center task dispatch, multi-agent comparison, fixture expectations, and evidence capture.
- [POC Plan](docs/repo-goal/00-poc.md): product scope, architecture reasoning, phase plan, and acceptance criteria.
- [Accelerated Local File Search](docs/repo-goal/01-accelerated-local-file-search.md): v0 runtime decision and narrowed local-search phase.
- [Facts And Hardening](docs/repo-goal/02-v0-facts-and-hardening.md): hardening plan, UAT gaps, and runbook readiness.
- [Local Memory And AI Agent](docs/repo-goal/03-local-memory-and-ai-agent.md): local memory, token safety, and tool guardrails.
- [OpenAI Agent Runner](docs/repo-goal/04-openai-agent-runner.md): guarded `ask <question>` implementation plan.
- [Agent Conversation Context And Tool Catalog](docs/repo-goal/05-agent-conversation-context-and-tools.md): planned App DM natural conversation, tool catalog, and context summarization behavior.
- [Agent Token Onboarding](docs/repo-goal/06-agent-token-onboarding.md): user-facing local-only AI agent token setup guidance.
- [OpenAI Model Selection](docs/repo-goal/07-openai-model-selection.md): local CLI model discovery, selected model storage, and validation criteria.
- [Google Workspace OAuth And Read-only Tools](docs/repo-goal/08-google-workspace-oauth.md): local Google OAuth, read-only agent tools, token storage, and validation criteria.
- [Central Server TODO Management](docs/repo-goal/09-central-server-todo.md): planned Local Server, Center Server, and Center Server DB split with TODO management as the first central capability.
- [Search, Read, And Summarize Workflow](docs/repo-goal/10-search-read-summarize.md): implemented local and Google search/read/summarize workflow plus required token access.
- [Remote Task Dispatch And Agent Optimization](docs/repo-goal/11-remote-task-dispatch.md): implemented first hybrid dispatch slice for Center Server-owned tasks, Local Agent worker execution, registration, heartbeat, and claim leases.
- [Local Agent Runtime Status](docs/repo-goal/12-local-agent-runtime-status.md): runtime heartbeat status in Slack App Home and fixed unavailable-agent guidance.
- [Dynamic Readable Scope And Runtime Notices](docs/repo-goal/13-dynamic-readable-scope-and-runtime-notices.md): selected plan for Slack-native folder scope expansion plus Local Agent online/offline notices.
- [Agent Retrieval Reviewer](docs/repo-goal/14-agent-retrieval-reviewer.md): implemented ambiguity handling and reviewer quality gate for `ask` and App DM answers.
- [Typed Agent Workflow And Local Observability](docs/repo-goal/15-typed-agent-workflow-and-local-observability.md): typed planner/executor/reviewer workflow and local structured event logs.
- [Project Memory](docs/memory/index.md): implementation decisions, progress notes, validation history, and likely next work.
- [Agent Instructions](AGENTS.md): repository workflow, testing, documentation, and collaboration rules.

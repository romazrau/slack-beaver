# Quick UAT Start Guide

## Purpose

Use this guide to start Slack Beaver quickly for manual UAT from one of three
states:

- First startup: the machine still needs Slack tokens, local folders, and the AI
  agent token configured.
- Resume startup: local setup already exists and you only need to restart the
  runtime.
- Reset-state startup: local memory should be cleared before repeating UAT.

This guide intentionally points to the deeper setup documents instead of
duplicating secret setup details.

## 1. First Startup

Use this path on a new machine, after a fresh clone, or when `.env`, Slack app
tokens, local folders, or the AI agent token are not configured yet.

Before starting, read the setup document:

- [Slack API And Local Runtime Setup](../setup/slack-api-and-local-runtime.md)

That document covers:

- Slack app settings.
- Slack Socket Mode tokens for `.env`.
- Secret handling rules.
- Local folder allowlist commands.
- AI agent token setup through the local CLI.
- Optional Google Workspace read-only setup.

Do not paste Slack tokens or OpenAI API keys into Slack.

One-line startup command after `.env` exists:

```sh
npm run uat:first
```

Set a different UAT folder if needed:

```sh
UAT_FOLDER=/absolute/path/to/fixtures npm run uat:first
```

### Steps

1. Use Node.js 22.

```sh
nvm use
node -v
```

2. Install dependencies.

```sh
npm install
```

3. Create `.env` from `.env.example`, then set local Slack tokens and runtime
   paths. Keep `.env` uncommitted.

Required for the Local Agent:

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SOCKET_MODE_ENABLED=true
LOCAL_MEMORY_ENABLED=true
LOCAL_MEMORY_DB_PATH=./data/slack-beaver.sqlite
OPENAI_TOKEN_PATH=./tokens/openai.key
AUDIT_LOG_PATH=./logs/audit.jsonl
```

4. Add at least one UAT folder.

```sh
npm run agent:folders:add -- /absolute/path/to/folder
npm run agent:folders:list
```

For fixture UAT, use the local fixture corpus:

```sh
npm run agent:folders:add -- ./doc-test
```

5. Set the AI agent token locally.

```sh
npm run agent:secrets:set-openai
```

This saves the OpenAI API key on this computer. The key needs `List models:
Read` for model discovery and `Responses: Write` for agent answers.

6. Verify the project.

```sh
npm run verify
```

7. Start the Local Agent.

```sh
npm run dev
```

Expected output:

```text
Slack Beaver Local Agent is running with Slack Socket Mode.
```

8. In Slack, open `Slack Beaver Local Agent` and run:

```text
find moonlit harbor
ask What file contains moonlit harbor?
```

9. If testing central TODO management too, start Center Server in another
   terminal.

```sh
npm run center:dev
```

Then smoke test TODO state:

```sh
npm run center:tasks:create -- --title "UAT follow up" --created-by UAT --owner Owner
npm run center:tasks:list
```

## 2. Resume Startup

Use this path when `.env`, allowed folders, local memory, and the AI agent token
already exist.

One-line startup command:

```sh
npm run uat:resume
```

### Steps

1. Use Node.js 22.

```sh
nvm use
node -v
```

2. Check setup state without printing secrets.

```sh
npm run agent:folders:list
npm run agent:models:current
npm run agent:google:status
```

3. Start the Local Agent.

```sh
npm run dev
```

4. Run Slack smoke tests.

```text
find moonlit harbor
ask What file contains moonlit harbor?
help
```

5. Inspect audit shape if needed. Do not copy full file contents into docs.

```sh
node -e 'const fs=require("fs"); const p="logs/audit.jsonl"; const lines=fs.existsSync(p)?fs.readFileSync(p,"utf8").trim().split(/\n/).filter(Boolean):[]; const last=lines.length?JSON.parse(lines.at(-1)):null; console.log(JSON.stringify(last?{query:last.query,resultCount:last.resultCount,status:last.status,source:last.source,hasTimestamp:Boolean(last.timestamp)}:{entries:0}, null, 2));'
```

6. Start Center Server only if TODO API UAT is in scope.

```sh
npm run center:dev
```

In another terminal:

```sh
npm run center:tasks:list
```

## 3. Reset-state Startup

Use this path when you need a clean Local Agent memory state before repeating
UAT. This clears SQLite local memory records but does not delete token files.

One-line startup command:

```sh
npm run uat:reset
```

Set a different UAT folder if needed:

```sh
UAT_FOLDER=/absolute/path/to/fixtures npm run uat:reset
```

### Steps

1. Stop any foreground runtime with `Ctrl-C`.

2. Reset local memory with explicit confirmation.

```sh
npm run agent:memory:reset -- --confirm RESET_LOCAL_MEMORY --yes
```

This clears:

- Allowed folders.
- Settings.
- Conversation state.
- Tool-call records.
- Provider setup metadata.

This keeps:

- OpenAI token file at `OPENAI_TOKEN_PATH`.
- Google token file at `GOOGLE_TOKEN_PATH`.
- `.env`.

3. Re-add the UAT folder.

```sh
npm run agent:folders:add -- ./doc-test
npm run agent:folders:list
```

4. Re-record provider metadata if needed.

If `ask <question>` says the AI token is not configured, run:

```sh
npm run agent:secrets:set-openai
```

5. Start the Local Agent.

```sh
npm run dev
```

6. Run reset-state Slack smoke tests.

```text
find moonlit harbor
ask What file contains moonlit harbor?
reset memory
```

The Slack `reset memory` message must return local-only reset guidance and must
not delete memory from Slack.

7. For Center Server TODO UAT, use a separate temporary DB if you need clean
central TODO state.

```sh
CENTER_DB_PATH=/tmp/slack-beaver-center-uat.sqlite npm run center:dev
```

In another terminal:

```sh
CENTER_DB_PATH=/tmp/slack-beaver-center-uat.sqlite npm run center:tasks:create -- --title "Clean UAT task" --created-by UAT --owner Owner
CENTER_DB_PATH=/tmp/slack-beaver-center-uat.sqlite npm run center:tasks:list
```

## Cleanup

Stop foreground processes with `Ctrl-C`.

Keep runtime artifacts uncommitted:

```sh
git status --short
```

Expected tracked-file changes should be intentional source or documentation
changes only. Local `.env`, token files, SQLite files, logs, and build outputs
should remain ignored.

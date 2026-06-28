# Slack API And Local Runtime Setup

## Purpose

This document keeps setup and operational details out of the README while preserving enough information to recreate the local Slack Beaver runtime.

Slack is only the UI/control surface. The user's computer must run the Local Agent process for local file search and guarded AI tool calls to work.

```text
Slack User
  -> Slack Workspace
  -> Slack Socket Mode WebSocket
  -> Local Agent on the user's computer
  -> allowlisted local folders
  -> Slack response
```

## Slack App Requirements

Create or use an internal Slack app with these settings:

- Socket Mode: enabled
- Slash command: `/agent`
- Slash command usage hint: `find <query>`
- App Home: enabled
- App Home Messages tab: enabled
- App Home Messages tab user messages: enabled
- Event Subscriptions: enabled
- Bot events: `app_home_opened`, `message.im`
- Bot scopes: `commands`, `chat:write`, `im:history`

Reinstall the Slack app after changing scopes, events, App Home, or slash command settings.

Current internal/test app reference:

- Workspace: `For Coding`
- App name: `Slack Beaver Local Agent`
- App ID: `A0BDL410MPF`
- App-level token name: `slack-beaver-local-agent-socket`
- App icon asset: `assets/slack-beaver-local-agent-avatar.png`

## Secret Handling

- Actual Slack tokens only live in local `.env`.
- `.env` is gitignored and should remain `0600`.
- Do not paste, log, commit, or document token values.
- Regenerate tokens from Slack app settings if token exposure is suspected.
- OpenAI API tokens must be configured through the local CLI, not through Slack.

Secret-safe `.env` presence check:

```sh
node -e 'const fs=require("fs"); const s=fs.readFileSync(".env","utf8"); for (const k of ["SLACK_BOT_TOKEN","SLACK_APP_TOKEN","WATCHED_FOLDERS","DENYLIST_FOLDERS","AUDIT_LOG_PATH"]) console.log(`${k}: ${new RegExp("^"+k+"=.+","m").test(s)?"set":"missing"}`); console.log(`mode:${(fs.statSync(".env").mode & 0o777).toString(8)}`);'
```

## Local Environment

`.env.example` provides the expected shape. A local development `.env` normally needs:

```env
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SOCKET_MODE_ENABLED=true

# Local file access
WATCHED_FOLDERS=/absolute/path/to/folder-a,/absolute/path/to/folder-b
DENYLIST_FOLDERS=/Users/example/.ssh,/Users/example/Library
MAX_LOCAL_FILE_BYTES=1048576
MAX_SEARCH_RESULTS=5

# Local memory and OpenAI setup
LOCAL_MEMORY_ENABLED=true
LOCAL_MEMORY_DB_PATH=./data/slack-beaver.sqlite
OPENAI_TOKEN_PATH=./tokens/openai.key
OPENAI_MODEL=gpt-4.1-mini
MAX_AGENT_TOOL_TURNS=2
MAX_CONVERSATION_FULL_TURNS=8
CONVERSATION_RECENT_TURNS_AFTER_SUMMARY=4

# Local audit
AUDIT_LOG_PATH=./logs/audit.jsonl
```

The current local demo has used:

```env
SLACK_SOCKET_MODE_ENABLED=true
WATCHED_FOLDERS=/Users/romazrau/dev/slack-beaver/docs
DENYLIST_FOLDERS=/Users/romazrau/.ssh,/Users/romazrau/Library
MAX_LOCAL_FILE_BYTES=1048576
MAX_SEARCH_RESULTS=5
AUDIT_LOG_PATH=./logs/audit.jsonl
```

## Local Agent Commands

Install dependencies:

```sh
npm install
```

Start in foreground:

```sh
npm run dev
```

Expected startup output:

```text
Slack Beaver Local Agent is running with Slack Socket Mode.
```

Run verification:

```sh
npm run verify
```

Folder setup:

```sh
npm run agent:folders:add -- /absolute/path/to/folder
npm run agent:folders:list
npm run agent:folders:remove -- /absolute/path/to/folder
```

OpenAI token setup:

```sh
npm run agent:secrets:set-openai
```

Reset local memory with double confirmation:

```sh
npm run agent:memory:reset -- --confirm RESET_LOCAL_MEMORY --yes
```

The reset command clears SQLite local memory records. It does not delete the disk token file.

## Slack Usage

Slash command:

```text
/agent find onboarding
```

App Home Messages tab:

```text
find Socket
ask What does the deployment checklist say?
```

If no folder is configured, Slack responses should guide the user to run local folder setup commands. If no OpenAI token is configured, `ask <question>` should guide the user to run the local token setup command.

## Optional launchctl Demo

Foreground `npm run dev` is the canonical local development path. `launchctl submit` is only a demo convenience until a checked-in LaunchAgent plist exists.

Start:

```sh
launchctl submit -l slack-beaver-local-agent -- /bin/zsh -lc 'cd /Users/romazrau/dev/slack-beaver && npm run dev >> /tmp/slack-beaver-agent.log 2>&1'
```

Check:

```sh
launchctl list slack-beaver-local-agent
tail -n 30 /tmp/slack-beaver-agent.log
```

Remove:

```sh
launchctl remove slack-beaver-local-agent
```

If `launchctl list slack-beaver-local-agent` cannot find the label, the job is not running.

## Manual Validation

Use [Slack Local File Search v0 Runbook](../runbooks/slack-local-file-search-v0.md) for the full manual UAT checklist, audit-log inspection, and cleanup steps.

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
- App-level Socket Mode token scope: `connections:write`

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
- OpenAI API keys need `List models: Read` for local model discovery and switching, plus `Responses: Write` for the selected model.
- Google OAuth should stay read-only: `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/drive.readonly`, and `https://www.googleapis.com/auth/documents.readonly`.

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
LOCAL_AGENT_STATUS_CHANNEL_ID=

# Local file access
WATCHED_FOLDERS=/absolute/path/to/folder-a,/absolute/path/to/folder-b
DENYLIST_FOLDERS=/Users/example/.ssh,/Users/example/Library
MAX_LOCAL_FILE_BYTES=1048576
MAX_SEARCH_RESULTS=5

# Local memory and AI agent token setup
LOCAL_MEMORY_ENABLED=true
LOCAL_MEMORY_DB_PATH=./data/slack-beaver.sqlite
OPENAI_TOKEN_PATH=./tokens/openai.key
OPENAI_MODEL=gpt-5.5
MAX_AGENT_TOOL_TURNS=2
MAX_CONVERSATION_FULL_TURNS=8
CONVERSATION_RECENT_TURNS_AFTER_SUMMARY=4

# Optional Google Workspace read-only tools
GOOGLE_WORKSPACE_ENABLED=false
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_TOKEN_PATH=./tokens/google-oauth.json
GOOGLE_OAUTH_REDIRECT_HOST=127.0.0.1

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

Use Node.js 22 for install, verification, and runtime commands. The repository includes `.nvmrc` and `.node-version` for local version managers.

```sh
nvm use
node -v
```

Project npm scripts check the active Node major version before loading native SQLite bindings. If the terminal is on Node 20 or Node 24, the command exits with `nvm use` guidance before `better-sqlite3` can throw an ABI error.

Install dependencies:

```sh
npm install
```

`better-sqlite3` ships a native binding compiled for the active Node ABI. If dependencies were installed under a different Node major version, rebuild it before starting the Local Agent:

```sh
npm rebuild better-sqlite3
```

Start in foreground:

```sh
npm run dev
```

Expected startup output:

```text
Slack Beaver Local Agent is running with Slack Socket Mode.
```

If the AI agent token is missing, startup also prints the local setup command:

```text
npm run agent:secrets:set-openai
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

While the Local Agent is running, Slack can also manage dynamic readable scope
without editing `.env`:

```text
folders list
folders add /absolute/path/to/folder
folders remove /absolute/path/to/folder
status
status subscribe
```

`WATCHED_FOLDERS` remains the env-controlled bootstrap scope. Slack-added
folders are saved in local SQLite memory and merged with env folders. Env
folders cannot be removed from Slack.

`LOCAL_AGENT_STATUS_CHANNEL_ID` is optional. If it is set, startup and graceful
shutdown lifecycle notices go there. If it is empty, run `status subscribe` in
Slack to save the current conversation as the notice target.

AI agent token setup:

```sh
npm run agent:secrets:set-openai
```

This command prompts locally for the OpenAI API key, saves it to `OPENAI_TOKEN_PATH`, and records provider setup metadata in SQLite. Do not paste API keys or paid tokens into Slack; Slack only shows setup guidance.

The local setup command does not require Slack bot or app tokens. Full Slack tokens are still required when starting the Socket Mode Local Agent.

OpenAI model management:

```sh
npm run agent:models:current
npm run agent:models:list
npm run agent:models:set -- gpt-5.5
```

`agent:models:list` uses the saved API key to call OpenAI's model list endpoint and shows selectable Responses text models. `agent:models:set` only saves compatible models visible to that key, excluding specialized image, audio, realtime, transcription, and TTS models. The selected model is stored in local SQLite memory under `openai.model`; if no model is selected, the runtime uses `OPENAI_MODEL`, then the default `gpt-5.5`.

Google Workspace read-only setup:

```sh
npm run agent:google:login
npm run agent:google:status
npm run agent:google:logout
```

Google Cloud setup checklist:

1. Create or select a Google Cloud project for Slack Beaver UAT.
2. Enable Gmail API, Google Drive API, and Google Docs API.
3. Configure Google Auth Platform / OAuth consent:
   - App name: `Slack Beaver Local Agent`, or another clearly local test name.
   - Audience: External, Testing.
   - Test users: add the local Google test account used for UAT.
4. Create an OAuth client:
   - Application type: Desktop app.
   - Name: `Slack Beaver Local OAuth`, or another clearly local test name.
5. Copy the OAuth client ID and client secret into local `.env`. In the current Google Cloud UI, the desktop client secret may be under the client detail page's Additional information panel.

Set `GOOGLE_WORKSPACE_ENABLED=true`, `GOOGLE_OAUTH_CLIENT_ID`, and `GOOGLE_OAUTH_CLIENT_SECRET` before running login. The login command opens the local system browser, uses a localhost OAuth callback with PKCE and state validation, asks Google for account email plus offline read-only Gmail, Drive, and Docs scopes, and saves the token to `GOOGLE_TOKEN_PATH` with `0600` file permissions. SQLite stores only provider setup metadata, granted scopes, and account email.

If Chrome shows `ERR_BLOCKED_BY_CLIENT` on the final `127.0.0.1` callback page, first run `npm run agent:google:status`. In the tested Chrome profile, the visible callback page was blocked, but the local callback still completed and the token was saved successfully.

Current Google OAuth scopes are:

- `openid`
- `email`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/documents.readonly`

Do not request Gmail send/modify/delete, Drive write/share/delete, Docs write/comment, Calendar, Contacts, Admin SDK, or broad Workspace management scopes for the current read-only agent.

The read-only tools exposed to the agent are `local_search`, `local_file_read`, `gmail_search`, `gmail_read_message`, `google_drive_search`, and `google_doc_read` when their providers are configured. They stay behind the Tool Registry and return bounded content. Local file, Gmail, and document bodies are treated as untrusted context and are not written to the JSONL audit log.

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

If no folder is configured, Slack responses should guide the user to run local folder setup commands. If no AI agent token is configured, `ask <question>` should guide the user to run the local token setup command.

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

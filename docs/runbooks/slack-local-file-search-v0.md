# Slack Local File Search v0 Runbook

## Purpose

Repeat the v0 demo from a known local state without relying on conversation history.

This runbook verifies:

```text
Slack /agent find <query>
  -> Socket Mode
  -> Local Agent on this Mac
  -> allowlisted local folders
  -> Slack response
  -> JSONL audit log
```

## Preconditions

- Node.js dependencies are installed.
- A Slack internal/test app exists in the `For Coding` workspace.
- Socket Mode is enabled.
- `/agent` slash command exists with usage hint `find <query>`.
- App Home is enabled.
- Messages tab is enabled.
- Event Subscriptions are enabled.
- Bot events include `app_home_opened` and `message.im`.
- Bot scopes include `commands`, `chat:write`, and `im:history`.
- `.env` exists locally and is not committed.

Secret rules:

- Do not print, paste, commit, or document actual token values.
- Keep `.env` mode at `0600`.
- Track only whether secret keys are set.

Secret-safe `.env` checks:

```sh
node -e 'const fs=require("fs"); const s=fs.readFileSync(".env","utf8"); for (const k of ["SLACK_BOT_TOKEN","SLACK_APP_TOKEN","WATCHED_FOLDERS","DENYLIST_FOLDERS","AUDIT_LOG_PATH"]) console.log(`${k}: ${new RegExp("^"+k+"=.+","m").test(s)?"set":"missing"}`); console.log(`mode:${(fs.statSync(".env").mode & 0o777).toString(8)}`);'
```

## Install And Verify

```sh
npm install
npm test
npm run typecheck
git diff --check
```

## Foreground Demo

Foreground mode is the canonical v0 demo mode because it is explicit and easy to stop.

```sh
npm run dev
```

Expected startup output:

```text
Slack Beaver Local Agent is running with Slack Socket Mode.
```

In Slack:

```text
/agent find Socket
```

Expected behavior:

- Slack returns local file matches from `WATCHED_FOLDERS`.
- Result includes filename, safe local path, match type, and short snippet.
- Response is visible only to the requester.
- `AUDIT_LOG_PATH` receives one JSONL entry.

## App Home Chat Demo

Open Slack left sidebar > Applications > `Slack Beaver Local Agent`.

Home tab expected behavior:

- Shows Local Agent title and read-only local search status.
- Shows counts for watched folders and denylist folders.
- Shows the chat command `find <query>`.
- Does not show token values or local folder paths.

Messages tab command:

```text
find Socket
```

Expected behavior:

- Bot replies in the app chat with the same result format as `/agent find Socket`.
- `AUDIT_LOG_PATH` receives one JSONL entry with `source=app_home_message`.
- `/agent find Socket` continues to write `source=slash_command`.

## Optional launchctl Demo

`launchctl submit` can start an identifiable user job, but it is not a full daemon packaging solution. Treat it as a demo convenience only. If `launchctl list slack-beaver-local-agent` cannot find the label, the job is not running and the foreground run path should be used.

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

Future hardening should replace this with a checked-in LaunchAgent plist template if a persistent local daemon remains a requirement.

## Manual UAT Checklist

Use a safe watched folder. A temporary fixture folder is recommended when testing denylist and file size behavior.

| Case | Command | Expected |
| --- | --- | --- |
| Successful search | `/agent find alpha-visible` | At least one allowlisted result |
| App Home search | `find alpha-visible` in app Messages tab | At least one allowlisted result |
| No result | `/agent find missing-needle` | Clear no-result response |
| Invalid command | `/agent` or `/agent list tasks` | Usage or unsupported command response |
| Invalid app message | `list tasks` in app Messages tab | Usage or unsupported command response |
| Denylist skip | `/agent find deny-secret-hit` | No denied file returned |
| Oversized skip | `/agent find oversized-hit` | Oversized file skipped |
| Agent offline | Stop Local Agent, then run `/agent find alpha-visible` | Slack cannot complete local search |

## Audit Log Inspection

Inspect shape only. Do not copy full snippets or file contents into documentation.

```sh
node -e 'const fs=require("fs"); const p="logs/audit.jsonl"; const lines=fs.readFileSync(p,"utf8").trim().split(/\n/); const last=JSON.parse(lines.at(-1)); console.log(JSON.stringify({query:last.query,resultCount:last.resultCount,status:last.status,hasTimestamp:Boolean(last.timestamp),hasSlackUserId:Boolean(last.slackUserId),hasChannelId:Boolean(last.channelId),hasErrorSummary:Boolean(last.errorSummary)}, null, 2));'
```

Expected fields:

- `timestamp`
- `slackUserId`
- `channelId`
- `query`
- `resultCount`
- `status`
- `source`
- Optional `errorSummary`

## Cleanup

Stop foreground process with `Ctrl-C`.

Remove optional launchctl job:

```sh
launchctl remove slack-beaver-local-agent
```

Keep local runtime artifacts uncommitted:

```sh
git status --short
```

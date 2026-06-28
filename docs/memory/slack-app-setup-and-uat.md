# Slack App Setup And Live UAT

## Date

2026-06-28

## Context

Slack Local File Search v0 needed a real internal/test Slack app to verify the full path:

```text
Slack -> Socket Mode -> Local Agent on user's computer -> allowlisted folders -> Slack response
```

The setup had to keep secrets private while making the created resources identifiable and removable.

## Decisions

- Use the `For Coding` Slack workspace for the internal/test app.
- Name the Slack app `Slack Beaver Local Agent`.
- Use Socket Mode so v0 does not need a public Request URL or cloud-hosted Slack backend.
- Keep OAuth scope minimal for v0: `commands`.
- Create only the slash command needed for the demo: `/agent` with usage hint `find <query>`.
- Store actual token values only in local `.env`.
- Keep `.env` gitignored with mode `0600`.
- Use a removable macOS user job label for the local daemon: `slack-beaver-local-agent`.

## Created Slack Resources

- Workspace: `For Coding`
- App name: `Slack Beaver Local Agent`
- App ID: `A0BDL410MPF`
- App-level token name: `slack-beaver-local-agent-socket`
- Slash command: `/agent`
- Slash command description: `Find local files from the Local Agent`
- Slash command usage hint: `find <query>`

The app can be found and removed from Slack app settings by name or app ID. The app-level token can be found and revoked by the token name above.

## Local Configuration

The local `.env` contains the real Slack tokens and must not be committed or copied into documentation.

Secret-safe local values used for UAT:

```env
SLACK_SOCKET_MODE_ENABLED=true
WATCHED_FOLDERS=/Users/romazrau/dev/slack-beaver/docs
DENYLIST_FOLDERS=/Users/romazrau/.ssh,/Users/romazrau/Library
MAX_LOCAL_FILE_BYTES=1048576
MAX_SEARCH_RESULTS=5
AUDIT_LOG_PATH=./logs/audit.jsonl
```

`.env` was checked by presence only:

- `SLACK_BOT_TOKEN`: set
- `SLACK_APP_TOKEN`: set
- `SLACK_SOCKET_MODE_ENABLED`: set
- `WATCHED_FOLDERS`: set
- `AUDIT_LOG_PATH`: set
- File mode: `600`

## Runtime Fix During UAT

The first live `npm run dev` failed because `@slack/bolt` did not provide `App` as a named ESM export at runtime under the project's NodeNext ESM configuration.

Fix:

- Import the Slack Bolt package default object.
- Instantiate `slackBolt.App`.
- Keep the existing command handler behavior unchanged.

Commit:

- `923cce3 fix(slack): load Bolt app in ESM runtime`

## Verification Performed

Automated checks:

```sh
npm test
npm run typecheck
```

Both passed after the runtime import fix.

Live Slack UAT:

- Started the Local Agent and connected to Slack Socket Mode.
- Ran `/agent find Socket` in Slack `#社交`.
- Received 3 local file matches from the allowlisted `docs` folder.
- Slack response included filename, safe local path, match type, and snippet.
- Response was visible only to the requester.
- Audit log recorded the request with `status=success`, query, result count, Slack user ID, channel ID, and timestamp.
- Audit log did not record full file contents.

## Local Daemon Operation

The interactive agent process was stopped after UAT, then restarted as an identifiable macOS user job:

```sh
launchctl submit -l slack-beaver-local-agent -- /bin/zsh -lc 'cd /Users/romazrau/dev/slack-beaver && npm run dev >> /tmp/slack-beaver-agent.log 2>&1'
```

Check status:

```sh
launchctl list slack-beaver-local-agent
tail -n 30 /tmp/slack-beaver-agent.log
```

Remove:

```sh
launchctl remove slack-beaver-local-agent
```

The launchctl job was verified connected to Slack Socket Mode.

## Remaining Manual UAT

The successful-search path is verified. The following manual checks remain useful before calling v0 fully demo-hardened:

- No-result query gives a clear Slack response.
- Empty or invalid query is rejected cleanly.
- Denylisted folders are not read.
- Oversized files are skipped.
- Stopping the Local Agent makes Slack unable to search local files.

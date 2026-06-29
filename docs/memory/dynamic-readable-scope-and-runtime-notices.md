# Dynamic Readable Scope And Runtime Notices

## Context

The Local Agent already has two local-folder configuration paths:

- `WATCHED_FOLDERS` from `.env`.
- SQLite `allowed_folders`, currently managed by local CLI commands.

The effective search scope already merges those sources before local search and
agent tool execution. The missing product surface is a Slack-native way for the
user to inspect and extend that scope after the server is running.

The project also already records Local Agent runtime heartbeat state, but it
does not proactively tell a user when the local server starts, restarts, or
gracefully shuts down.

## Decision

Keep `WATCHED_FOLDERS` as the bootstrap/default readable path source and use
SQLite `allowed_folders` for runtime user expansion. This avoids editing `.env`
from Slack and keeps all dynamic grants in the existing local memory database.

Add deterministic Slack commands before the natural AI conversation route:

```text
folders list
folders add /absolute/path/to/folder
folders remove /absolute/path/to/folder
status
status subscribe
```

Folder additions must reuse the existing local validation function. Natural AI
conversation must not infer or grant filesystem access.

For lifecycle notices, use the Slack target resolution order:

1. `LOCAL_AGENT_STATUS_CHANNEL_ID`.
2. SQLite setting saved by `status subscribe`.
3. Most recent local-memory Slack conversation channel.

If no Slack target exists, the server should log the notice locally and continue.
This is expected on first-ever startup unless a status channel is configured.

## Tradeoffs

This method keeps folder authorization explicit and auditable, but it means a
first-ever proactive Slack startup message needs either
`LOCAL_AGENT_STATUS_CHANNEL_ID` or a previously saved subscription target.

The shutdown notice can only be best-effort. Graceful `SIGINT` and `SIGTERM`
can send an offline message; crashes, `kill -9`, host sleep, network loss, or
Slack API failure can prevent delivery.

## Implementation Notes For Next Work

- Extend command parsing without routing folder/status commands through OpenAI.
- Add LocalMemory settings for status notice target metadata.
- Add a method to fetch the most recent conversation channel for fallback
  notices.
- Add reusable status formatter functions that redact secrets and token values.
- Send the startup notice only after Slack Socket Mode has started.
- Register graceful shutdown handlers after the Slack app is created.
- Keep App Home status and proactive notices consistent but do not expose local
  full paths in App Home unless the user explicitly asks through `folders list`
  or `status`.

## Validation Expectation

Logic changes must add tests for folder command behavior, status formatting,
target resolution, and lifecycle notice formatting/sending. Manual UAT should
cover Slack `status`, dynamic folder add/list/remove, startup online notice,
and graceful shutdown offline notice.

## Implementation Result

Implemented the selected approach.

- Slack deterministic commands now handle readable-scope inspection and dynamic
  folder grants before natural AI conversation routing.
- `folders add` reuses local folder validation and saves real paths in SQLite
  `allowed_folders`.
- `folders remove` disables only conversation-added folders and refuses to
  remove env-provided `WATCHED_FOLDERS`.
- `status subscribe` saves the current Slack conversation as the lifecycle
  notice target.
- Startup and graceful shutdown send best-effort online/offline notices after
  Slack Socket Mode starts, using env target, subscribed target, recent
  conversation, or local logging when no Slack target exists.
- `LOCAL_AGENT_STATUS_CHANNEL_ID` is documented as the optional first-start
  notice target.

Validation passed under Node.js `v22.23.1`:

```sh
npm test -- tests/agentCommands.test.ts tests/localMemory.test.ts tests/slackApp.test.ts tests/runtimeStatus.test.ts tests/config.test.ts
npm run typecheck
```

# Dynamic Readable Scope And Runtime Notices

## Goal

Let users inspect and extend the Local Agent readable local-file scope from Slack
conversation after startup, while keeping a single local environment default
path as the bootstrap source.

Also make Local Agent lifecycle changes visible through proactive Slack status
messages when the server starts, restarts, or shuts down.

## Selected Approach

Use one readable-scope model with two sources:

- `WATCHED_FOLDERS`: the bootstrap default path list from local `.env`.
- SQLite `allowed_folders`: user-approved paths added after startup.

The effective readable scope is the existing merge of `WATCHED_FOLDERS` and
enabled SQLite `allowed_folders`. All dynamic additions must reuse
`validateAllowedFolderInput`, including absolute-path, directory, readability,
realpath, and denylist checks.

Do not let natural AI conversation infer or grant filesystem access. Folder
scope changes must use explicit deterministic commands handled before the OpenAI
agent path.

## Slack Commands

Add deterministic App DM and slash-command support for:

```text
folders list
folders add /absolute/path/to/folder
folders remove /absolute/path/to/folder
status
status subscribe
```

`folders list` shows the effective readable scope split by source:

- `env`: folders from `WATCHED_FOLDERS`.
- `conversation`: enabled folders saved in SQLite.

`folders add` validates and saves the real path to SQLite. Re-adding a disabled
folder re-enables it. Re-adding an enabled folder is idempotent.

`folders remove` disables only SQLite `allowed_folders`. It must not remove
`WATCHED_FOLDERS`; env defaults remain controlled by local `.env`.

`status` reports Local Agent runtime, available commands, effective readable
scope, AI agent token configuration, Google Workspace configuration, and the
current status notice target.

`status subscribe` stores the current Slack DM/channel as the preferred lifecycle
notice target. This gives the user a Slack-native way to choose where restart
and shutdown notices should be sent.

## Runtime Notice Target

Use this target resolution order for proactive lifecycle notices:

1. `LOCAL_AGENT_STATUS_CHANNEL_ID`, when configured.
2. SQLite setting saved by `status subscribe`.
3. The most recent local-memory Slack conversation channel, if available.

If no target is available, log the same status notice to stdout and keep startup
healthy. This can happen on first-ever startup before any Slack conversation or
explicit status channel exists.

## Startup And Restart Notice

After Slack Socket Mode starts successfully, send a proactive online notice to
the resolved target. The notice should include:

- Runtime state: online.
- Server start timestamp.
- Available user commands.
- Effective readable scope, grouped by source.
- AI agent token setup state.
- Google Workspace setup state.
- Status notice target source.

This same path handles first startup and later restarts because both go through
the same Local Agent startup code.

## Shutdown Notice

On graceful shutdown signals such as `SIGINT` and `SIGTERM`, send a proactive
offline notice before exiting. The notice should include:

- Runtime state: offline.
- Shutdown timestamp.
- Last known effective readable scope.
- AI agent token setup state.
- Google Workspace setup state.

Hard process termination, crashes before Slack client startup, network failure,
or an invalid Slack token can still prevent delivery. These cases should be
logged locally and treated as unavoidable delivery limitations for this phase.

## Scope

- Add deterministic command parsing before natural AI conversation routing.
- Reuse existing folder validation and SQLite `allowed_folders`.
- Add status formatting functions that do not expose secrets or token values.
- Add a lifecycle notice sender around Local Agent startup and graceful shutdown.
- Add tests for command parsing, folder add/list/remove behavior, status output,
  target resolution, startup notice formatting, and shutdown notice formatting.
- Update README and memory documents after implementation changes are validated.

## Out Of Scope

- Moving Slack ingress to Center Server.
- Granting folder access through natural-language AI interpretation.
- Editing `.env` from Slack.
- Removing or changing env-provided `WATCHED_FOLDERS` from Slack.
- Guaranteed offline notice delivery after `kill -9`, host sleep, network loss,
  process crash before handler registration, or Slack API outage.
- A LaunchAgent installer or OS-level daemon packaging.

## Acceptance Criteria

- A user can ask `folders list` and see the current readable local-file scope.
- A user can add an absolute readable folder from Slack with `folders add`.
- A user can remove a dynamically added folder from Slack with `folders remove`.
- Env-provided default folders remain visible but cannot be removed from Slack.
- Search and read tools use the merged env plus SQLite readable scope.
- `status` shows available commands, readable scope, AI token setup, Google
  setup, and lifecycle notice target without exposing secrets.
- Startup sends an online notice to the resolved Slack target when available.
- Graceful shutdown sends an offline notice to the resolved Slack target when
  available.
- First-ever startup without a known target logs the notice locally and explains
  how to configure `LOCAL_AGENT_STATUS_CHANNEL_ID` or run `status subscribe`.
- Tests cover the logic changes.

## Validation Plan

Focused tests:

```sh
npm test -- tests/agentCommands.test.ts tests/localMemory.test.ts tests/slackApp.test.ts
```

Full verification:

```sh
npm run verify
```

Manual UAT:

- Start `npm run dev`.
- Send `status` in Slack App DM.
- Send `folders list`.
- Send `folders add /absolute/path/to/fixture`.
- Confirm `find <query>` can see files under the new folder.
- Send `status subscribe`.
- Restart the Local Agent and confirm the online notice arrives.
- Stop the Local Agent with `Ctrl+C` and confirm the offline notice arrives.

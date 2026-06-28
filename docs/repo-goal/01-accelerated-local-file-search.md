# Accelerated Local File Search Phases

## Context

Time is now tighter than the original three-day POC plan. The first usable milestone should therefore be reduced to one core value path:

```text
Slack -> Socket Mode -> Local Agent on user's computer -> allowlisted folders -> Slack response
```

This accelerated plan intentionally defers Google Workspace, task tracking, advanced summaries, vector search, PDF/DOCX/XLSX parsing, and rich Slack UI until the local file search path is stable.

## Runtime Decision

Slack does not directly operate on OS folders. Slack is only the control surface.

The v0 runtime decision is:

```text
Local Agent = Slack bot backend + local file reader
```

The user must run the Local Agent process on their own computer. The Local Agent uses `SLACK_APP_TOKEN` to receive Slack events through Socket Mode, reads `WATCHED_FOLDERS` with the local OS account's permissions, and uses `SLACK_BOT_TOKEN` to respond in Slack.

This avoids a cloud-hosted Slack backend, local companion app registration, agent pairing, multi-machine routing, and desktop packaging in v0. If the Local Agent is offline, Slack cannot search that computer's local files.

## Goal

Deliver a Slack bot that can run locally and search files inside configured local folders.

The bot must be able to:

- Receive a Slack command or mention.
- Search only allowlisted local folders.
- Find supported text files by filename and basic content match.
- Return a short, traceable answer in Slack with file names and paths.
- Avoid reading sensitive or non-allowlisted paths.

## Scope

### In Scope

- Slack Socket Mode bot entrypoint.
- Minimal Node.js/TypeScript project skeleton.
- Environment-based configuration for Slack tokens and watched folders.
- Local file scanning for `.txt`, `.md`, `.markdown`, `.csv`, `.json`.
- Filename and plain-text content search.
- File size limit and denylist protection.
- Basic audit log for search requests and outcomes.
- Behavior-focused tests for path guard and search logic.

### Out of Scope

- Google Drive, Google Docs, and Google Sheets integration.
- AI tool calling beyond a simple response formatter.
- Vector database or embeddings search.
- PDF, DOCX, XLSX, images, audio, or video parsing.
- Automatic file modification.
- Arbitrary shell command execution.
- Multi-user shared task state.
- Slack modals, buttons, and complex interactive workflows.

## Phase 0: Local Agent Runtime Decision

### Objective

Make the earliest architecture decision explicit before implementation: Slack cannot read local folders by itself.

### Tasks

- Document that Slack is the control surface, not the OS folder reader.
- Document that the user must start a Local Agent process on their computer.
- Document `Local Agent = Slack bot backend + local file reader`.
- Document that v0 does not include a cloud server, companion app pairing, or desktop UI.

### Acceptance Criteria

- README explains the Socket Mode event flow.
- This plan explains why v0 requires a local process.
- The plan states that local file search is unavailable when the Local Agent is offline.

### Verification

- Manual documentation review.

## Phase 1: Repo And Runtime Skeleton

### Objective

Create the smallest maintainable runtime foundation for the local Slack bot.

### Tasks

- Add Node.js/TypeScript project files.
- Add lint, test, and development scripts.
- Add `.env.example` with Slack and local file configuration.
- Add config loading with explicit validation errors.
- Add a minimal app entrypoint that can start without connecting to Slack in test mode.

### Acceptance Criteria

- `npm test` runs successfully.
- `npm run typecheck` runs successfully if the TypeScript setup includes a dedicated typecheck command.
- `.env.example` documents the required Slack and local file variables.
- Missing required config fails with a clear error.

### Verification

- Automated tests for config parsing and validation.
- Manual check that README setup instructions match the actual scripts.

## Phase 2: Local File Guard And Search Core

### Objective

Build the local file search logic before connecting it to Slack.

### Tasks

- Implement watched folder allowlist handling.
- Implement denylist handling for sensitive paths.
- Normalize and resolve paths before access checks.
- Enforce a maximum file size before reading.
- Implement recursive scan for supported text file extensions.
- Implement filename and content search.
- Return results with path, filename, match type, and short snippet.

### Acceptance Criteria

- Search only reads files under configured watched folders.
- Search rejects path traversal attempts.
- Search skips denied folders and oversized files.
- Search returns deterministic results for a fixed fixture directory.
- Search result snippets are short enough for Slack messages.

### Verification

- Unit tests for allowlist, denylist, path normalization, extension filtering, file size limit, and content matching.
- Fixture-based tests for filename and content search.

## Phase 3: Slack Bot Search Command

### Objective

Connect Slack to the local search core with the fewest moving parts.

### Tasks

- Configure Slack Bolt for JavaScript with Socket Mode.
- Support one command first, such as `/agent find <query>`.
- Optionally support `@bot find <query>` after the command path works.
- Acknowledge Slack commands quickly, then run search and reply in the same channel or thread.
- Format search results with file name, path, match type, and snippet.
- Return clear messages for no results, invalid query, and config errors.

### Acceptance Criteria

- `/agent find onboarding` returns matching local files from watched folders.
- Slack command acknowledgement completes within Slack's timeout window.
- Results do not include denied or non-allowlisted paths.
- Errors are reported without exposing secrets or stack traces.

### Verification

- Automated tests for command parsing and response formatting.
- Manual Slack smoke test with a fixture watched folder.

## Phase 4: Audit Log And Demo Hardening

### Objective

Make the local search demo traceable and safe enough to show.

### Tasks

- Add a local audit log for each search request.
- Record timestamp, Slack user ID, channel ID, query, result count, status, and error summary.
- Add simple result limit configuration.
- Add README instructions for setup, running, testing, and demo flow.
- Add a short UAT script under `docs/repo-goal/` or README.

### Acceptance Criteria

- Every Slack search request writes one audit entry.
- Audit entries do not store full file contents.
- Search responses are capped to a configured maximum result count.
- README is sufficient for a new contributor to configure, run, and verify the local Slack file search demo.

### Verification

- Automated tests for audit log writer behavior where practical.
- Manual Slack UAT covering successful search, no result, denied path, oversized file, and invalid query.

## Deferred Phases

### Phase 4.6: Slack App Home Chat

Add Slack-native App Home and Messages tab support so the app can be opened from Slack's Applications sidebar and used as a private chat surface. This keeps Slack as the UI and does not introduce a separate desktop app.

The first chat command is `find <query>`, sharing the same guarded local search and audit behavior as `/agent find <query>`.

### Phase 5: Local Index Cache

Add SQLite-backed metadata indexing for faster repeated searches. This should only start after direct local search works end to end.

### Phase 6: AI Summary Layer

Add LLM-based summarization for selected local search results. The first version should summarize only files returned by the guarded search layer.

### Phase 7: Google Workspace Read-only

Add Google OAuth installed-app flow, Drive search, Docs read, and Sheets range read after local file search is validated.

### Phase 8: Local Tasks And Audit Expansion

Add personal task creation, task listing, task updates, and richer tool call audit logs.

## Fastest Demo Path

The fastest credible demo is:

1. Start the local agent.
2. Configure `WATCHED_FOLDERS` to a fixture or real safe folder.
3. Run `/agent find <keyword>` in Slack.
4. Show matching file names, safe local paths, and snippets.
5. Show the audit log entry for that request.

This proves the core promise before expanding the system: Slack can act as the control surface for a local agent that safely searches local files.

# Local Memory And AI Agent Plan

## Context

Slack Beaver supports Slack App Home chat and `/agent find <query>` by reading allowlisted local folders. This phase adds the first local memory and AI token safety slice: SQLite folder memory, local setup CLI, token-like Slack refusal, and a guarded Tool Registry path for local search.

The new product direction is:

```text
Slack App Home / Messages
  -> Local Agent
  -> SQLite local memory
  -> guarded Tool Registry
  -> allowlisted local folders
  -> OpenAI API when configured locally
  -> Slack response
```

Slack remains the UI and control surface. The Local Agent remains the only process that can read local folders, store local memory, call tools, and send responses.

## Goals

- Remember which local folders the user has allowed the agent to read.
- Ask for allowed folders when no known folders are configured for the current local user.
- Let the user add more allowed folder paths later.
- Reuse known allowed folders when the user does not specify a path.
- Add an OpenAI-backed agent plan, with token setup through a local CLI only.
- Define prompt-injection and paid-token safety requirements before implementation.

## Non-Goals

- Do not add real OpenAI API calls yet.
- Do not accept AI tokens through Slack messages.
- Do not add Claude, opencode, or multi-provider routing in the first implementation.
- Do not add arbitrary shell command execution.
- Do not allow the LLM to expand folder permissions.
- Do not modify local files.
- Do not introduce a cloud backend or shared user state.

## Runtime Decisions

- Use SQLite as the default local memory store.
- Use OpenAI as the first AI provider.
- Configure the OpenAI API key through a local CLI setup command, not Slack.
- Keep Slack App Home and Messages as the user-facing chat surface.
- Keep all folder access decisions in deterministic application code.
- Treat Slack messages, local file content, and LLM output as untrusted input.

## User Experience

When the user opens `Slack Beaver Local Agent` in Slack:

- If no allowed folders exist, the Home tab and chat response should ask the user to configure folders locally.
- The Slack message should not request secrets or accept API tokens.
- The agent should explain that folder setup happens on the user's computer.

When the user sends a search or agent request:

- If no folder path is mentioned, the agent uses known allowed folders from SQLite.
- If a folder path is mentioned, the agent only uses it when it is already allowed or after a local add-folder flow validates and stores it.
- If a requested path is outside allowed folders, the agent refuses and explains that local folder permission must be added first.

Local CLI:

```sh
npm run agent:folders:add -- /absolute/path/to/folder
npm run agent:folders:list
npm run agent:folders:remove -- /absolute/path/to/folder
npm run agent:secrets:set-openai
```

Paid AI tokens must be entered locally and must not be sent through Slack.

## Local Memory Model

SQLite should store at least these concepts:

- `allowed_folders`: resolved absolute path, display label, created time, last verified time, enabled state.
- `settings`: provider selection, model preference, result limits, and setup flags that are not secret values.
- `conversations`: Slack user/channel/thread references and short state needed for follow-up behavior.
- `tool_calls`: tool name, source, input summary, output summary, status, error summary, timestamps, and audit correlation.
- `provider_config`: provider name and metadata showing whether a token is configured, without storing the token value in ordinary tables.

The first implementation stores the OpenAI token in `OPENAI_TOKEN_PATH`, defaulting to `./tokens/openai.key`, with `0600` file permissions. The SQLite `provider_config` table only records whether the token is configured, not the token value.

## Tool And Agent Safety

The AI agent may choose among registered tools, but the Tool Registry owns permissions and execution.

Minimum tool policy:

- Tools are explicit and allowlisted.
- File tools are read-only.
- File tools can only read enabled `allowed_folders`.
- Denylist checks, extension checks, file size limits, and path traversal protection still apply.
- The LLM cannot request arbitrary shell commands.
- The LLM cannot directly change allowed folders.
- High-risk future actions require explicit human approval before execution.

Prompt-injection policy:

- Local file content must be treated as data, never as system or developer instructions.
- Slack user text must not be allowed to reveal secrets or override tool policy.
- LLM output must be validated before any tool call is executed.
- Retrieved document text should be quoted or delimited in prompts as untrusted context.
- If document content asks the agent to ignore policy, reveal tokens, or read other folders, the agent must ignore that instruction.

## Acceptance Criteria

- With no stored allowed folders, App Home shows setup guidance and chat requests ask the user to add a local folder through CLI.
- After adding an allowed folder locally, App Home shows a count of known folders without exposing full paths by default.
- Search and agent requests use known allowed folders when no path is specified.
- Adding a folder validates absolute path, existence, OS read permission, denylist exclusion, and resolved path safety before saving.
- OpenAI token setup happens only through local CLI and does not echo the token.
- Slack messages containing token-like strings are refused with guidance to use local CLI setup.
- Every agent tool call writes an audit entry without full file contents or secrets.
- Prompt-injection fixture content cannot cause reads outside allowed folders, denylist bypass, token disclosure, shell execution, or file modification.
- Existing `/agent find <query>` and App Home `find <query>` behavior remains compatible.

## Verification Plan

Automated tests should cover:

- No-folder setup response.
- Add/list/remove folder command behavior.
- Folder path normalization and denylist rejection before SQLite persistence.
- Known folder reuse when no path is specified.
- Slack token-like message refusal.
- OpenAI token setup path does not log or echo token values.
- Tool Registry rejects unknown tools, shell commands, denied paths, and non-read-only file operations.
- Prompt-injection fixture text cannot override tool policy.
- Audit entries include tool source and summaries, not secrets or full document content.

Manual UAT should cover:

- Open App Home with no allowed folders and see setup guidance.
- Add `/Users/romazrau/dev/doc-test` locally, then ask in Slack without specifying a path.
- Add a second folder and confirm the known folder count changes.
- Try to ask Slack to use a non-allowed folder and confirm refusal.
- Try to paste a fake OpenAI token in Slack and confirm the bot refuses to accept it.
- Configure OpenAI locally, ask an agent-style question, and confirm only registered tools are used.

## Execution Results

Execution date: 2026-06-28

Completed:

- Added `better-sqlite3` local memory storage.
- Added SQLite schema for `allowed_folders`, `settings`, `conversations`, `tool_calls`, and `provider_config`.
- Added `LOCAL_MEMORY_ENABLED`, `LOCAL_MEMORY_DB_PATH`, and `OPENAI_TOKEN_PATH`.
- `WATCHED_FOLDERS` can be empty when local memory is enabled.
- Added local CLI scripts:
  - `npm run agent:folders:add -- /absolute/path/to/folder`
  - `npm run agent:folders:list`
  - `npm run agent:folders:remove -- /absolute/path/to/folder`
  - `npm run agent:secrets:set-openai`
- Added folder validation for absolute path, realpath, directory type, OS read permission, and denylist checks.
- Added local OpenAI token storage with `0600` permissions and provider metadata in SQLite.
- Added Slack token-like message refusal before command parsing or audit logging.
- Added App Home setup guidance when no allowed folders are known.
- Added Tool Registry `local_search` execution path with tool-call summaries in SQLite.
- Kept existing slash command and App Home `find <query>` behavior compatible.

Deferred:

- Real OpenAI API calls.
- LLM tool-choice loop.
- Multi-provider routing.
- Prompt-injection fixture corpus and live Slack UAT for AI agent behavior.

Verification:

- `npm test` passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
- Token-like secret scan against `README.md`, `docs`, `.env.example`, and source/tests was run before commit.

## Documentation Definition Of Done

- README states which Local Memory/token safety behavior is implemented and which OpenAI agent behavior remains deferred.
- Memory docs record SQLite, OpenAI-only, and local CLI token setup decisions.
- No real token values appear in tracked files.
- `git diff --check` passes.
- `npm test` passes.
- Changes are committed with implementation, tests, and documentation together.

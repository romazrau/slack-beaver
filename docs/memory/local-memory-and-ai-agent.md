# Local Memory And AI Agent

## Date

2026-06-28

## Decision

The first local memory and OpenAI token safety slice is implemented. It adds SQLite memory, local folder setup CLI, local OpenAI token setup metadata, Slack token-like refusal, and a guarded local-search Tool Registry path.

The defaults are:

- Local memory store: SQLite.
- First AI provider: OpenAI.
- AI token setup surface: local CLI only.
- Slack App Home remains the chat UI.
- Local Agent remains the runtime for memory, local file reads, tool execution, and Slack replies.

## Rationale

- SQLite fits the single-user, single-machine POC while leaving a path toward repository interfaces and future central APIs.
- OpenAI-only keeps the first provider implementation and test matrix small.
- Local CLI token entry avoids sending paid secrets through Slack.
- Keeping folder permission decisions in Local Agent code prevents the LLM from expanding its own access.

## Implemented Behavior

- If a user opens the app with no known folders, App Home shows local folder setup guidance.
- If no folders exist and the user runs `find <query>`, Slack asks them to add a folder locally.
- If known folders exist, search requests use `.env` watched folders plus SQLite enabled allowed folders.
- Users can add, list, and disable paths through local CLI scripts.
- Users can initialize local memory again with `npm run agent:memory:reset -- --confirm RESET_LOCAL_MEMORY --yes`.
- Slack `reset memory` only returns local CLI guidance and never deletes local records directly.
- Slack refuses pasted AI-token-like strings and directs users to local CLI setup.
- Local search now runs through a Tool Registry wrapper that records tool-call summaries in SQLite.

## Deferred Behavior

- Real OpenAI API calls.
- LLM agent loop and tool choice.
- Prompt-injection fixture UAT against LLM-generated tool calls.
- Claude or opencode provider support.

## Safety Rules

- Slack messages, local files, and LLM output are untrusted input.
- Token values must not appear in Slack, prompts, audit logs, README examples, or memory docs.
- Local file content must not be treated as instructions.
- The LLM cannot read outside allowlisted folders, bypass denylist checks, run shell commands, or modify files.
- Tool calls require deterministic guards before execution and audit entries after execution.
- Local memory reset requires a local CLI command plus exact confirmation phrase and `--yes`.
- Reset clears SQLite local memory and provider metadata but does not delete token files on disk.

## Planned Documentation And Validation

- `docs/repo-goal/03-local-memory-and-ai-agent.md` defines the next phase scope and acceptance criteria.
- README describes the implemented local memory/token safety slice and calls out deferred OpenAI agent work.
- Tests cover folder memory, reset double confirmation, folder validation, token refusal, local token storage permissions, App Home setup guidance, and existing search compatibility.

## Live UAT

Verified on 2026-06-28 with Chrome against the real `For Coding` Slack app:

- Local Agent was started with an empty live verification memory DB and empty `WATCHED_FOLDERS`.
- App Home showed `Allowed folders` as `0`, `Setup needed`, the folder add CLI, `OpenAI token` as `Not configured`, and `Use local CLI only`.
- App Messages `find Socket` returned clear setup guidance instead of silently failing.
- App Messages `reset memory` returned local-only reset guidance, the exact double-confirmation command, the deletion scope, and the note that token files are not deleted.
- App Messages with a fake token-like string returned `I cannot accept API keys or paid tokens in Slack` and the local OpenAI setup CLI.
- The token-like refusal did not write a search audit entry.

Computer Use plugin instructions were read for this verification request, but no direct Computer Use UI MCP was exposed in the callable tool list. Chrome plugin completed the practical Slack UI verification.

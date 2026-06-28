# Agent Conversation Context And Tool Catalog

## Date

2026-06-28

## Context

Slack Beaver currently supports explicit `find <query>` and `ask <question>` commands in App DM, plus `/agent find <query>` and `/agent ask <question>` slash command paths. General App DM text still returns unsupported-command guidance.

The next feature needs natural App DM conversation behavior, an agent-readable list of server-side tools, and a bounded conversation context strategy.

## Decision

Add `docs/repo-goal/05-agent-conversation-context-and-tools.md` as the implementation specification for the next phase.

The planned defaults are:

- Natural conversation only applies to App Home / bot DM `message.im`.
- Slash commands remain explicit.
- One context unit is one turn: user message plus assistant reply.
- Keep up to 8 full turns before summarization.
- When full turns exceed 8, summarize the oldest 8 turns into one safe summary turn.
- Later main-agent requests receive the summary turn plus the latest 4 full turns.
- Tool Registry remains the only execution boundary.
- The initial agent-readable tool catalog exposes only `local_search(query: string)`.

## Implementation Result

Implemented on 2026-06-29.

Changes:

- App DM general text now routes to natural conversation mode when local OpenAI token setup is complete.
- Slash commands remain explicit and still require `/agent find <query>` or `/agent ask <question>`.
- Token-like Slack messages and `reset memory` keep their refusal/guidance precedence before persistence or model calls.
- SQLite now stores full conversation turns and summary turns in `conversation_turns`.
- Conversation context sends up to 8 full turns before summarization.
- When full turns exceed 8, the oldest 8 full turns are summarized into one safe summary turn.
- Later main-agent requests receive the summary turn plus the latest 4 full turns by default.
- The summarizer receives no tools.
- The agent-readable tool catalog is generated from Tool Registry metadata and currently lists only `local_search(query: string)`.
- Natural conversation can proceed without configured folders; local-document answers are guided by instructions that folder setup is required before `local_search` can return useful context.

Validation:

- `npm run typecheck` passed.
- `npm test` passed with fake-client coverage for natural conversation routing, no-folder conversation, context retention, summarization, summary-plus-recent context, and no-tool summarizer calls.

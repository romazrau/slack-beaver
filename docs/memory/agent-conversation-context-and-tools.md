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

## Result

The implementation boundary is now documented before runtime changes. The next code phase can focus on routing, conversation persistence, summarization, prompt/tool catalog wiring, and tests.

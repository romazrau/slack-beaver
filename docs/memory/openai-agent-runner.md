# OpenAI Agent Runner

## Context

The local memory phase added OpenAI token setup metadata but intentionally
deferred real OpenAI API calls and LLM-selected tool calls.

This phase implements the first guarded `ask <question>` path while preserving
the deterministic `find <query>` path.

## Implementation

- Added the official `openai` SDK.
- Added `OPENAI_MODEL`; the current default is `gpt-5.5`.
- Added `MAX_AGENT_TOOL_TURNS` with default `2`.
- Added `ask <question>` parsing for slash command and App Home Messages tab.
- Added `AgentModelClient` so automated tests can use fake model clients without
  network or paid API calls.
- Added a production OpenAI Responses API adapter behind the model-client
  interface.
- Added a bounded agent runner that can only execute model-requested tools
  through the Tool Registry.
- Added deterministic repeated-tool-call hardening so the runner can stop an
  identical repeated tool request and answer from the last bounded tool output
  when possible.
- Added strict `local_search` tool schema and validation.
- Rejected unknown tools, extra input fields, malformed tool inputs, empty
  queries, shell-like tool names, and path-bearing `local_search` requests.
- Added local OpenAI token-file loading with owner-only permission validation.

## Safety Notes

- Slack text, local file content, and model output remain untrusted.
- The LLM cannot add folders, read arbitrary paths, run shell commands, or write
  files.
- Tool call output is bounded by existing search limits and snippets; full
  documents are not sent through audit logs.
- OpenAI tokens are loaded only from `OPENAI_TOKEN_PATH`, never from Slack text
  or ordinary SQLite tables.

## Validation

- Fake-client tests cover successful `local_search`, unknown tool rejection,
  malformed input rejection, repeated `local_search` fallback, setup gating,
  audit summary behavior, and existing `find` compatibility.
- Token loader tests cover restrictive permissions and broad-permission
  rejection.
- Live Slack/OpenAI UAT passed for Local Agent startup, `find`, no-result
  search, simple `ask`, natural App DM local-file lookup, token-like input
  refusal, `help`, slash-command `find`, `reset memory` guidance, App Home
  status, model listing, and audit-log shape.
- Live Slack/OpenAI UAT found selected `ask` prompts could repeat equivalent
  `local_search` calls and exceed `MAX_AGENT_TOOL_TURNS`; the repeated-tool-call
  fallback is the follow-up hardening for that finding.

## Deferred

- Re-run live Slack UAT for the previously failing repeated-tool-call prompts.
- Larger prompt-injection fixture corpus.
- AI summary memory and conversation follow-up state.
- Multi-provider routing.
- Embeddings or local index cache.

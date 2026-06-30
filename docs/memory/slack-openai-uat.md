# Slack OpenAI UAT And Tool-loop Hardening

## Context

Live Slack UAT with a real local OpenAI token showed that most non-Google flows
worked, but selected `ask <question>` prompts could repeatedly request the same
`local_search` tool call until the runner hit `MAX_AGENT_TOOL_TURNS`.

## UAT Results

Passing Slack-visible flows:

- Local Agent started under Node.js 22.23.1 and connected through Slack Socket Mode.
- `find moonlit harbor` returned local file matches.
- A no-result `find` query returned no matches and wrote `resultCount=0`.
- `ask What file contains moonlit harbor?` answered from local context.
- Natural App DM conversation found Priya-owned TODOs in local files.
- Token-like Slack input was refused with local-only OpenAI token setup guidance.
- `help` returned natural App DM capability guidance.
- `/agent find semiconductor revenue` returned slash-command search results.
- `reset memory` returned local-only double-confirmation guidance without deleting memory.
- App Home showed `find`, `ask`, AI/OpenAI, and local setup/status content.
- `npm run agent:models:list` listed selectable models and showed `gpt-5.5` as active.

Observed failing prompts before hardening:

- `ask Which fixture mentions Mira deployment checklist?`
- `ask In local files, what TODO mentions owner Priya?`

Both failed with `Agent exceeded the maximum tool-call turns.` because the model
requested another equivalent `local_search` after useful bounded output was
already available.

## Decision

The runner now has a deterministic repeated-tool-call guard instead of relying
only on prompt instructions or a larger turn budget.

- Each executed tool call is tracked by normalized `{ name, input }` signature.
- If the model requests the same tool call again, the runner stops executing
  tools and answers from the previous bounded tool output when possible.
- `local_search` fallback answers include filenames, paths, and snippets from
  the already bounded tool result.
- If no useful bounded output is available, the runner returns configured-context
  insufficiency instead of continuing the loop.
- Agent instructions now explicitly tell the model to stop after sufficient
  context and not repeat identical tool calls.

## Fixture Scope Note

Live Slack `find moonlit harbor` returned one more match than a pure fixture-only
local test because runtime searchable roots merge `.env` `WATCHED_FOLDERS` with
SQLite local-memory allowed folders.

For pure fixture UAT, clear `.env` `WATCHED_FOLDERS` or point it only at the same
fixture root used by local memory.

## Socket Mode Startup Stability

`npm run uat:first` exposed a Slack Socket Mode crash after the Local Agent
printed the online notice. Slack sent a `disconnect` frame while the SDK state
machine was still in `connecting`, and `@slack/socket-mode` threw
`Unhandled event 'server explicit disconnect' in state 'connecting'`.

The Local Agent now creates an explicit `SocketModeReceiver` and wraps its
`SocketModeClient.onWebSocketMessage` before startup. The wrapper ignores only
Slack `disconnect` frames received while the SDK reports `connecting`; normal
messages and `disconnect` frames after the connection is established still use
the SDK handler path.

This is intentionally narrow so Slack's normal reconnect behavior remains owned
by the SDK.

## Validation

- Focused regression test covers a model that repeats identical `local_search`
  requests and verifies the runner returns a bounded fallback answer.
- Focused Slack app tests cover the Socket Mode `connecting` + server
  `disconnect` guard, normal `hello` handling, and connected-state disconnect
  handling.
- Build-output runtime import of `dist/slack/slackApp.js` passed, covering the
  Node ESM/CommonJS interop path used by Local Agent startup.
- Focused `tests/agentCommands.test.ts` passed.
- `npm run typecheck` passed.

## Next Verification

- Run the full `npm run verify` gate after documentation updates.
- Re-run Slack UAT for the two previously failing `ask` prompts:
  - `ask Which fixture mentions Mira deployment checklist?`
  - `ask In local files, what TODO mentions owner Priya?`

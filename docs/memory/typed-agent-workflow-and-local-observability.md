# Typed Agent Workflow And Local Observability

## Date

2026-06-29

## Context

The Local Agent already has a guarded OpenAI runner, Tool Registry, bounded
local and Google read tools, conversation context, a reviewer role, audit logs,
and agent trace logs.

The remaining POC concern is stability and traceability:

- Tool use is still partly prompt-led.
- Retrieval planning is not yet a typed, validated contract.
- Planner, executor, reviewer, and chat responsibilities are not fully
  separated in code.
- Existing logs help debug tool loops, but they are not yet a single structured
  event stream that can be matched directly to a Slack screenshot timestamp.

## Decision

For the current POC, implement only the first architecture option:

```text
Chat Orchestrator
  -> Planner role
  -> deterministic Executor module
  -> Reviewer role
```

Planner, Executor, Reviewer, and Chat Orchestrator should be separate
responsibilities inside the same Local Agent process. They should not become
separate OS processes or independently deployed agents for the POC.

The Executor should be deterministic code, not an LLM agent. It should execute
only validated plan steps through the existing Tool Registry.

Structured local logging is part of this architecture decision. The next phase
should introduce `logs/agent-events/YYYY-MM-DD.jsonl` as the primary event
stream with shared `traceId`, `turnId`, `conversationId`, Slack metadata,
agent role, event name, and IO summary.

## Logging Decision

Local logs may retain more information than a centralized production service,
but full raw IO should not be the default.

Use explicit modes:

- `summary`: default, bounded, redacted, good for normal POC runs.
- `trace`: structured planner/reviewer JSON, tool inputs, bounded previews, and
  source locators.
- `full_local_debug`: local-only diagnosis mode for fuller prompts, model
  responses, Slack text, and tool payloads.

Even full local debug mode must redact likely tokens, private keys, and secret
material before writing.

Retention should also be explicit:

- Normal event logs can keep a longer local window, such as 14 days.
- Full debug logs should keep a shorter window, such as 3 days.

## Traceability Requirement

The target debugging workflow is:

1. A user captures a Slack screenshot that shows a message time.
2. The developer opens `logs/agent-events/YYYY-MM-DD.jsonl` for that local date.
3. The developer filters nearby `localTime`, Slack `channelId`, Slack
   `messageTs` or `threadTs`, `conversationId`, or `traceId`.
4. The developer can inspect the planner output, tool calls, evidence ledger,
   reviewer decision, final reply, and any error summaries for that turn.

This is required for POC-quality evaluation because it makes model behavior,
tool behavior, and final output quality inspectable after the fact.

## Tradeoffs

Keeping all roles in one process avoids premature distributed-agent complexity
while still making responsibilities testable.

Typed planning adds schema and validation work, but it should reduce repeated
tool calls, broad search terms, and low-quality fallbacks.

Full local debug logging is useful during POC evaluation, but it increases local
privacy risk and disk usage. Making it opt-in with shorter retention keeps it
available without making it the default operating mode.

## Next Work

- Run live Slack/OpenAI UAT for the typed workflow with event log lookup from a
  Slack screenshot timestamp.
- Decide whether deterministic `find <query>` should also write to the unified
  `agent-events` stream or remain audit-only for the POC.
- Decide whether planner fallback should remain enabled by default after live
  UAT or become stricter.
- Keep `find <query>` deterministic and outside the typed retrieval workflow.

## Implementation Result

Implemented on 2026-06-29.

The Local Agent now has a typed workflow path for AI retrieval answers when
normal config enables `TYPED_AGENT_WORKFLOW_ENABLED`.

The implemented path is:

```text
Chat Orchestrator
  -> Planner role
  -> deterministic Executor module
  -> Evidence ledger
  -> Draft answer
  -> Reviewer role
```

The Executor is deterministic TypeScript code and still runs tools only through
Tool Registry.

The new local event log writes `logs/agent-events/YYYY-MM-DD.jsonl` with shared
turn identifiers and Slack metadata when available. Event log detail is
controlled by `AGENT_EVENT_LOG_MODE`, with summary, trace, and full local debug
modes. The logger redacts likely secrets before writing.

Focused validation passed with:

```sh
npm test -- tests/config.test.ts tests/agentPlan.test.ts tests/agentEventLog.test.ts tests/agentCommands.test.ts
npm run typecheck
```

## Retrieval UAT Hardening Follow-up

Implemented on 2026-06-29.

The deterministic Executor now ranks typed read targets within already returned
search results before choosing the file to read. This keeps `find <query>`
deterministic while making typed `ask` plans prefer likely content files over
README, index, docs memory, repo-goal, and runbook search-hint files. The
planning-path penalty is intentionally narrow so ordinary content under
`docs/`, such as API or user documentation, is not demoted just because it is in
a docs folder.

The legacy tool loop now has one bounded final-read allowance: when the model
reaches the configured tool-turn boundary and asks for exactly one read target
that was returned by an earlier search result, the runner executes that read
and allows one more model/reviewer turn. The allowance does not accept arbitrary
paths or unsearched read targets.

If the model asks for more tool work after that allowance or after the configured
tool-turn budget, the loop now returns the best partial result it already has,
explicitly asks whether to continue or stop, and saves the pending tool calls in
local memory `settings` with `pending_user_confirmation` status. Clear
`continue`/`繼續` replies resume directly from that saved pending call with the
previous response id and gathered tool outputs. Other natural-language replies
are routed through a no-tool confirmation classifier that returns
`continue`, `stop`, `unrelated`, or `unclear`; unrelated turns keep the pending
state for up to five turns, unclear replies ask the user to choose, and stop
replies clear the saved state.

Typed reviewer `needs_more_context` decisions are treated as internal control
signals. Because the typed workflow currently does not execute reviewer-requested
follow-up plans, Slack receives a grounded insufficient-context answer instead
of the reviewer instruction text.

Focused validation passed with:

```sh
npm test -- tests/agentCommands.test.ts
npm run typecheck
```

Additional review hardening on 2026-06-29 covered stale continuation risk and
ordinary docs content ranking with the same focused validation commands.

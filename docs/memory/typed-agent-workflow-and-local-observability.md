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

- Add `docs/repo-goal/15-typed-agent-workflow-and-local-observability.md` as the
  implementation plan.
- Add a typed planner contract and validation tests.
- Add a deterministic executor module that consumes validated plans and builds
  an evidence ledger.
- Update the reviewer path to evaluate plan, evidence, and draft answer.
- Add the unified local event logger and log redaction tests.
- Keep `find <query>` deterministic and outside the typed retrieval workflow.

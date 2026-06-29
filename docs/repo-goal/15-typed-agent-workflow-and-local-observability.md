# Typed Agent Workflow And Local Observability

Status: implemented and focused automated validation passed.

## Goal

Make `ask <question>` and natural App DM answers more stable without expanding
the POC into a multi-service agent platform.

The selected POC design is a typed workflow inside the existing Local Agent
process:

```text
Chat Orchestrator
  -> Planner role
  -> deterministic Executor module
  -> Reviewer role
  -> Slack reply
```

The workflow should improve four areas:

- Clarify underspecified requests before searching.
- Stabilize tool selection and prevent uncontrolled tool loops.
- Require grounded answers from retrieved evidence.
- Leave structured local logs that make a Slack screenshot traceable by time,
  conversation, and turn.

## Decision

Keep Planner, Executor, Reviewer, and Chat Orchestrator logically separate, but
run them in the same Local Agent process for the POC.

Do not create separate OS processes, Center Server workers, or independently
deployed agents for this phase. The added complexity is not needed to validate
the product workflow.

### Chat Orchestrator

The Chat Orchestrator owns Slack-facing conversation behavior:

- Receive slash command or App DM input.
- Apply deterministic command handling before AI routing.
- Load bounded conversation context.
- Decide whether the turn needs the typed retrieval workflow.
- Send the final Slack reply.
- Write turn-level observability events.

It does not directly execute model-selected tools. Tool execution remains behind
the deterministic Executor and Tool Registry.

### Planner

The Planner is a model role, not a separate service.

It should return structured JSON for retrieval-like turns:

```json
{
  "intent": "answer_from_sources",
  "requiresClarification": false,
  "clarifyingQuestion": null,
  "sources": ["local_files", "gmail", "google_docs"],
  "searches": [
    {
      "tool": "local_search",
      "query": "deployment checklist"
    }
  ],
  "readPolicy": {
    "maxReads": 3,
    "reason": "Search snippets may be insufficient."
  }
}
```

The application must validate the plan before execution:

- Reject unknown tools.
- Reject unexpected fields.
- Reject empty or overlong queries.
- Reject read steps that do not reference prior search results.
- Ask the user for clarification when the plan marks the request as
  underspecified.

### Executor

The Executor is deterministic TypeScript code.

It should:

- Execute only validated plan steps.
- Use the existing Tool Registry as the only tool boundary.
- Preserve bounded output rules.
- Build an evidence ledger from search and read results.
- Write structured logs for every tool input and result summary.

The Executor is intentionally not an LLM agent. This keeps tool use predictable
and testable.

### Reviewer

The Reviewer remains a model role with no tools.

It receives:

- The user request.
- Safe conversation context.
- The validated plan.
- The evidence ledger.
- The draft answer.

It returns structured JSON:

```json
{
  "decision": "accept",
  "message": null
}
```

Allowed decisions:

- `accept`: Send the draft answer.
- `needs_more_context`: Return bounded feedback to the planner/executor flow.
- `ask_user`: Ask one focused clarifying question.
- `reject_insufficient_context`: Explain that configured context is
  insufficient.

## Local Observability

Structured local logging is part of this phase, not a later hardening task.

The current `logs/audit.jsonl` and `logs/agent-traces/YYYY-MM-DD.jsonl` are
useful, but the next phase should introduce one primary event stream:

```text
logs/agent-events/YYYY-MM-DD.jsonl
```

Audit and trace logs may remain for compatibility, but all new agent workflow
events should share the same identifiers:

- `traceId`
- `turnId`
- `conversationId`
- Slack `channelId`
- Slack `userId`
- Slack `messageTs` or `threadTs` when available

### Event Envelope

Each JSONL event should use a stable envelope:

```json
{
  "timestamp": "2026-06-29T10:15:30.123Z",
  "localTime": "2026-06-29 18:15:30.123 Asia/Taipei",
  "traceId": "uuid",
  "turnId": "uuid",
  "conversationId": "slack:C123:1780000000.000100",
  "agentId": "local-agent",
  "agentRole": "planner",
  "event": "planner_output",
  "source": "app_home_message",
  "slack": {
    "userId": "U123",
    "channelId": "C123",
    "threadTs": "1780000000.000100",
    "messageTs": "1780000001.000200"
  },
  "io": {
    "direction": "output",
    "kind": "model_response",
    "summary": "Planner selected local_search and local_file_read.",
    "payloadRedacted": {}
  }
}
```

### Required Events

The POC workflow should log these events when applicable:

- `slack_message_received`
- `command_parsed`
- `conversation_context_loaded`
- `planner_input`
- `planner_output`
- `clarification_requested`
- `tool_call_start`
- `tool_call_result`
- `evidence_ledger_updated`
- `draft_answer`
- `reviewer_input`
- `reviewer_decision`
- `slack_reply_sent`
- `error`

### Log Modes

Local logs should support explicit detail modes:

```text
AGENT_EVENT_LOG_MODE=summary
AGENT_EVENT_LOG_MODE=trace
AGENT_EVENT_LOG_MODE=full_local_debug
```

Mode behavior:

- `summary`: Default. Store event names, identifiers, timing, result counts,
  source labels, and error summaries.
- `trace`: Store structured planner/reviewer JSON, tool inputs, bounded previews,
  hashes, and source locators.
- `full_local_debug`: Local-only debug mode. Store fuller prompts, responses,
  Slack text, and tool payloads when needed for POC diagnosis.

Even in `full_local_debug`, the logger must redact likely secrets, tokens, and
private key material before writing.

### Retention

Add separate retention controls:

```text
AGENT_EVENT_LOG_RETENTION_DAYS=14
AGENT_FULL_DEBUG_LOG_RETENTION_DAYS=3
```

Retention should be best-effort and local-only. Deleting old logs must not block
Slack replies.

## Scope

- Add typed planning for retrieval-like `ask` and natural App DM turns.
- Keep deterministic commands outside model planning.
- Keep `find <query>` deterministic.
- Keep all tool execution behind Tool Registry.
- Add an evidence ledger used by drafting and review.
- Add a primary structured local event log.
- Add tests for plan validation, executor behavior, reviewer decisions, and log
  envelope shape.

## Out Of Scope

- Separate agent processes.
- Moving Slack ingress to Center Server.
- Centralized log upload.
- Admin dashboard.
- Full RBAC or organization-wide policy management.
- Vector search or embeddings.
- Unbounded raw IO logging by default.

## Acceptance Criteria

- Planner, Executor, Reviewer, and Chat Orchestrator are separate modules or
  clearly separated code paths.
- Planner output is structured and validated before any tool call.
- Executor never runs a tool that is missing from the validated plan.
- Executor never bypasses Tool Registry.
- Reviewer receives plan, evidence, and draft answer, and returns a structured
  decision.
- A clear retrieval request produces traceable planner, tool, evidence,
  reviewer, and Slack reply events.
- An ambiguous request logs the planner or deterministic clarification decision
  and asks one focused question before tool use.
- Every event in `logs/agent-events/YYYY-MM-DD.jsonl` includes `timestamp`,
  `localTime`, `traceId`, `turnId`, `conversationId`, `agentRole`, `event`, and
  `io.summary`.
- Slack `channelId`, `userId`, and `messageTs` or `threadTs` are recorded when
  available, allowing a Slack screenshot timestamp to be matched to nearby log
  entries.
- Default logging does not write full local file bodies, full email bodies,
  full Google Docs content, tokens, or private key material.
- `full_local_debug` can be enabled locally for POC diagnosis and later disabled
  without changing agent behavior.
- Tests cover logging shape and redaction for representative Slack input, model
  output, tool output, reviewer decisions, and errors.

## Validation Plan

Focused automated validation:

```sh
npm test -- tests/agentCommands.test.ts
npm test -- tests/agentEventLog.test.ts
npm run typecheck
```

Full validation:

```sh
npm run verify
```

Manual UAT:

- Send a Slack App DM clear retrieval request and confirm the reply appears.
- Use the Slack message timestamp from the UI screenshot to find matching
  `logs/agent-events/YYYY-MM-DD.jsonl` entries.
- Confirm the matching trace includes planner output, tool calls, evidence,
  reviewer decision, and Slack reply.
- Enable `full_local_debug`, repeat one local-only test request, confirm fuller
  local debug payloads are written, then disable it.
- Confirm token-like text and private-key-like text are redacted from logs.

## Implementation Result

Implemented on 2026-06-29.

- Added typed planner contract validation in `src/agent/agentPlan.ts`.
- Added deterministic plan execution in `src/agent/agentPlanExecutor.ts`.
- Added an evidence ledger in `src/agent/evidenceLedger.ts`.
- Added `planner` as an `AgentModelClient` purpose.
- Added a typed workflow path before the legacy agent loop when
  `TYPED_AGENT_WORKFLOW_ENABLED` is true.
- Kept the legacy tool loop as a fallback when planner output is not valid JSON
  or the planner call fails.
- Kept `find <query>` deterministic and outside typed planning.
- Updated the reviewer path so typed workflow review can inspect the validated
  plan, evidence ledger, and draft answer.
- Added `logs/agent-events/YYYY-MM-DD.jsonl` local event logging with `traceId`,
  `turnId`, `conversationId`, agent role, event name, Slack metadata, local
  Taipei time, and IO summary.
- Added event log modes through `AGENT_EVENT_LOG_MODE`: `summary`, `trace`, and
  `full_local_debug`.
- Added retention settings through `AGENT_EVENT_LOG_RETENTION_DAYS` and
  `AGENT_FULL_DEBUG_LOG_RETENTION_DAYS`.
- Added redaction for likely token, secret, API key, password, and private-key
  material before writing local event logs.
- Updated OpenAI Responses adapter behavior so tool/evidence outputs without a
  previous model response are sent as text context instead of invalid
  function-call outputs.

Tradeoff:

- Hand-written test configs that omit `typedWorkflowEnabled` keep legacy
  behavior. Normal `loadConfig` enables typed workflow by default. This keeps
  existing coverage stable while allowing the POC runtime path to use typed
  planning.

Validation passed:

```sh
npm test -- tests/config.test.ts tests/agentPlan.test.ts tests/agentEventLog.test.ts tests/agentCommands.test.ts
npm run typecheck
```

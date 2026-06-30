# Agent Workflow State Machine

## Decision

Use a shared conversation-level workflow state machine for agent tasks.

Search and retrieval are the first consumer, but the state machine should not
be search-only. Future file writing, file editing, research organization, and
remote task execution should reuse the same top-level states for planning,
choice, confirmation, execution, completion, and stopped summaries.

## Rationale

The retrieval fallback optimization reduced the frequency of generic
insufficient-context answers, but it also showed a broader product issue: users
need to know why the agent stopped and what they can do next.

A search-only state machine would address the immediate local files / Google
Drive / Gmail retrieval path, but future write/edit tasks need the same
decision points:

- clarify ambiguous intent;
- choose among candidates;
- respect capability boundaries;
- stop with an actionable explanation;
- require confirmation before mutation.

The shared state machine avoids duplicating those decisions per feature.

## Planning Result

The planned core states are:

- `intake`
- `planning`
- `searching`
- `candidates_found`
- `needs_user_choice`
- `reading_context`
- `drafting`
- `reviewing`
- `ready_to_answer`
- `ready_to_act`
- `awaiting_confirmation`
- `executing_action`
- `completed`
- `stopped_with_summary`
- `failed`

The first runtime consumer should be retrieval because it already has planner,
executor, evidence, reviewer, retry, and stop-summary behavior.

Future file writing and editing should enter `ready_to_act` and
`awaiting_confirmation` before any filesystem mutation.

## Persistence Boundary

Start by recording state summaries in local trace/event logs.

Persist only states that need continuation:

- `needs_user_choice`
- `awaiting_confirmation`
- long-running `executing_action`

Avoid adding a durable schema until an implementation requires restart-safe
continuation beyond current traces.

## Next Work

- Implement a typed `AgentWorkflowState` only when runtime code needs to share
  state across retrieval, write/edit, or remote task paths.
- Add tests for state transition decisions before using the state machine to
  gate mutating file actions.
- Keep all non-success stops actionable: reason, attempted work, found context,
  and next user actions.

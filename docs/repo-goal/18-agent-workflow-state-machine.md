# Agent Workflow State Machine

## Goal

Define a shared conversation-level workflow state machine for Slack Beaver Local
Agent so future agent behavior can stop, continue, ask, answer, or act with
clear user guidance.

The state machine should not be search-only. Search and retrieval are the first
implementation target because they currently produce the most visible
insufficient-context stops, but the same workflow states should also support
future file writing, file editing, research organization, and remote task flows.

## Decision

Use one shared workflow state machine with task-kind-specific paths.

Rejected option:

- A search-only state machine would solve the immediate retrieval fallback
  problem, but it would duplicate the same clarification, confirmation,
  stopping, and recovery decisions when file writing or editing is added.

Selected option:

- A shared state machine owns the top-level conversation progress.
- Retrieval uses the search and read states first.
- Future write/edit actions reuse the same planning, confirmation, execution,
  completion, and stop states.
- Durable persistence is introduced only for states that need continuation
  across turns or process restarts.

## Core States

- `intake`: Parse user intent, detect the task kind, and collect obvious
  constraints from the conversation.
- `planning`: Build the typed plan and decide required tools, sources,
  capability boundaries, and mutation risk.
- `searching`: Search configured local files, Google Drive, and Gmail when the
  task needs retrieval.
- `candidates_found`: Record that candidates exist but the exact target is not
  yet verified.
- `needs_user_choice`: Ask the user to choose or narrow candidates when
  continuing without a choice would likely select the wrong source.
- `reading_context`: Read selected candidate content through bounded,
  source-specific read tools.
- `drafting`: Produce an answer or proposed action from the available plan and
  evidence.
- `reviewing`: Run groundedness, safety, intent, and capability review before a
  user-visible answer or action.
- `ready_to_answer`: The final answer is grounded and can be sent.
- `ready_to_act`: A mutating action is prepared, but has not yet been executed.
- `awaiting_confirmation`: User confirmation is required before file writing,
  file editing, or another mutation.
- `executing_action`: The confirmed mutating action is running.
- `completed`: The task completed successfully.
- `stopped_with_summary`: The workflow stopped safely with a reason, evidence
  summary, and concrete next steps.
- `failed`: A tool or runtime error prevented completion; the user receives a
  bounded recovery summary.

## Task-Kind Paths

`retrieve_answer`:

- Uses `intake`, `planning`, `searching`, `candidates_found`,
  `needs_user_choice`, `reading_context`, `drafting`, `reviewing`,
  `ready_to_answer`, `completed`, and `stopped_with_summary`.
- Stops with `stopped_with_summary` instead of a generic insufficient-context
  answer when configured evidence is too weak.

`write_file` and `edit_file`:

- Use `intake`, `planning`, `ready_to_act`, `awaiting_confirmation`,
  `executing_action`, and `completed`.
- May enter the retrieval path when the user asks to write or edit based on
  configured local files, Google Drive, or Gmail evidence.
- Must not execute mutation from ambiguous intent. Ambiguous write/edit flows
  stop in `needs_user_choice` or `awaiting_confirmation`.

`summarize_source` and `organize_research`:

- Reuse the retrieval path for source discovery and reading.
- Reuse `drafting`, `reviewing`, and `ready_to_answer` for the final summary or
  organized notes.

Future remote task flows:

- Reuse `planning`, `executing_action`, `completed`, `failed`, and
  `stopped_with_summary`.
- Add lease-specific or worker-specific implementation details outside the
  shared state vocabulary.

## State Data

The planning document should guide a future typed shape similar to:

```ts
type AgentWorkflowTaskKind =
    | "retrieve_answer"
    | "write_file"
    | "edit_file"
    | "summarize_source"
    | "organize_research"
    | "remote_task";

type AgentWorkflowStatus =
    | "intake"
    | "planning"
    | "searching"
    | "candidates_found"
    | "needs_user_choice"
    | "reading_context"
    | "drafting"
    | "reviewing"
    | "ready_to_answer"
    | "ready_to_act"
    | "awaiting_confirmation"
    | "executing_action"
    | "completed"
    | "stopped_with_summary"
    | "failed";

interface AgentWorkflowState {
    workflowId: string;
    taskKind: AgentWorkflowTaskKind;
    status: AgentWorkflowStatus;
    userGoal: string;
    constraints: readonly string[];
    sourcesSearched: readonly string[];
    candidateSources: readonly string[];
    selectedCandidateIds: readonly string[];
    evidenceSummary: string;
    stopReason: string;
    nextUserActions: readonly string[];
    pendingAction: string | null;
}
```

This shape is a planning target, not an immediate schema commitment.

## Persistence Recommendation

Start with trace-level state summaries:

- Record workflow state transitions in local event traces.
- Include `stopReason` and `nextUserActions` for every
  `stopped_with_summary` transition.
- Keep transient execution-only states in logs unless continuation requires
  persistence.

Persist only states that need multi-turn continuation:

- `needs_user_choice`
- `awaiting_confirmation`
- long-running `executing_action`

Do not introduce a durable database schema until a concrete implementation
needs restart-safe continuation beyond current traces and local memory.

## Stop And Guidance Policy

Every non-success stop must explain:

- why the agent stopped;
- what it already tried;
- what context or candidates were found;
- what the user can provide, choose, or confirm next.

The agent should avoid sending only:

```text
I could not produce a grounded answer from the configured local context.
```

For retrieval ambiguity:

- Show up to three likely candidates.
- Include source type, such as local file, Google Drive, or Gmail.
- Ask the user to choose one candidate or provide a title, source, or link.

For capability boundaries:

- State the unavailable capability, such as public web or Google web search.
- Name the configured sources that can be searched instead.

For file writing or editing:

- Summarize the proposed mutation.
- Ask for confirmation before writing or editing files.
- Move to `awaiting_confirmation` instead of executing ambiguous mutations.

## Acceptance Criteria

- The design clearly chooses a shared workflow state machine rather than a
  search-only state machine.
- Retrieval can use the state machine without changing the current evidence
  boundary: local files, Google Drive, and Gmail.
- Future file writing and editing have explicit confirmation states before any
  mutation.
- Stopped workflows have a user-visible summary that explains why execution
  stopped and what the user can do next.
- Persistence remains conservative and is limited to states that require
  continuation.

## Validation

This step is documentation-only. Manual validation is sufficient:

- Confirm this document covers retrieval, future writing/editing, research, and
  remote task reuse.
- Confirm the selected design is shared workflow state, not search-only state.
- Confirm stop guidance covers insufficient context, ambiguous candidates,
  missing capability, and mutation confirmation.

Future implementation should add automated coverage for:

- transition decisions;
- `needs_user_choice` when retrieval candidates are broad;
- `stopped_with_summary` when reviewer grounding still fails;
- `awaiting_confirmation` before file writing or editing;
- event traces containing `stopReason` and `nextUserActions`.

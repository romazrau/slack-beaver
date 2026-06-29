# Remote Task Dispatch And Agent Optimization

## Goal

Validate the next hybrid POC step: Center Server can own durable task state,
while Local Agents execute bounded work from their own machines and report
results back.

This phase should answer two product questions:

- Can Slack Beaver move beyond synchronous Slack replies into durable agent
  tasks with clear lifecycle state?
- Can one Center Server safely dispatch work to one or more registered Local
  Agents without exposing local files, local credentials, or unrestricted
  commands?

## Current State

- Slack ingress still runs inside the Local Agent through Socket Mode.
- The guarded agent loop can answer `ask <question>` and natural App DM
  messages by calling registered tools.
- Tool Registry already enforces a small read-only tool surface for local files,
  Gmail, Google Drive, and Google Docs.
- Center Server currently exposes a TODO-only HTTP API.
- Center Server does not yet authenticate Local Agents, register agent
  capability, lease tasks, dispatch work, or receive execution results.

## POC Boundary

This phase should keep Slack ingress in the Local Agent unless explicitly moved
in a later phase. The first remote-dispatch POC can be driven by CLI and HTTP
smoke commands before adding Slack commands.

In scope:

- Center-owned durable agent task queue.
- Local Agent registration and heartbeat.
- Task claim lease so only one Local Agent executes a task at a time.
- Local Agent worker loop that polls Center Server, claims work, executes a
  bounded task, and reports status.
- Reuse of existing guarded agent/tool execution paths.
- Tests for task lifecycle, lease behavior, validation, and failure cases.

Out of scope:

- Central Slack ingress.
- Slack bot/app token migration to Center Server.
- Multi-tenant auth, RBAC, organization policy, or billing.
- Arbitrary shell command execution.
- Write/edit tools for Google Workspace or local files.
- Vector search or large-scale distributed indexing.
- Browser automation as a task type.

## Proposed Architecture

```text
Slack User or CLI
      |
      v
Local Agent or Center CLI
      |
      v
Center Server
- agent task queue
- agent registry
- heartbeat state
- claim leases
- result storage
      ^
      |
Local Agent Worker
- polls for claimable tasks
- reports heartbeat
- executes guarded tools locally
- reports completed/failed/canceled status
```

The Center Server coordinates task ownership and state. The Local Agent remains
the only process that can access local files, local credential files, local
memory, Google OAuth tokens, and the user's OpenAI API key.

## Agent Task Lifecycle

Add a durable `agent_tasks` model with explicit status transitions:

```text
queued -> running -> completed
queued -> running -> failed
queued -> canceled
running -> queued
running -> failed
running -> completed
```

`running -> queued` is only allowed when the claim lease expires or a worker
explicitly releases the task.

Suggested statuses:

- `queued`: task is waiting for a Local Agent.
- `running`: a Local Agent has claimed the task.
- `completed`: task finished successfully and has a result summary.
- `failed`: task ended with a bounded error summary.
- `canceled`: task was canceled before completion.

## Minimal Data Model

### Agent Registry

Track Local Agent processes separately from users:

- `agentId`: stable local agent identifier.
- `ownerSlackUserId`: Slack user this agent belongs to.
- `displayName`: optional human-readable local machine name.
- `capabilities`: JSON list of supported task and tool capability names.
- `status`: `online`, `offline`, or `unknown`.
- `lastSeenAt`: last heartbeat timestamp.
- `createdAt`: registration timestamp.
- `updatedAt`: last registration update timestamp.

### Agent Task

Track executable work separately from TODO records:

- `id`: generated task id.
- `type`: task type, for example `answer_question`.
- `status`: lifecycle status.
- `createdBy`: creator identifier, usually Slack user id or CLI actor.
- `targetOwner`: optional Slack user id whose Local Agent should execute it.
- `input`: bounded JSON payload.
- `resultSummary`: bounded final answer or result metadata.
- `errorSummary`: bounded failure reason.
- `claimedByAgentId`: Local Agent currently holding the lease.
- `claimExpiresAt`: timestamp when another agent can reclaim the task.
- `attemptCount`: execution attempt count.
- `createdAt`: creation timestamp.
- `updatedAt`: last state change timestamp.

Do not store local file bodies, Gmail bodies, Google Docs bodies, OpenAI tokens,
Google tokens, or Slack tokens in Center Server task rows.

## Minimal API

Add Center Server JSON endpoints:

- `POST /agents/register`: register or refresh a Local Agent's metadata.
- `POST /agents/:agentId/heartbeat`: mark an agent as alive.
- `POST /agent-tasks`: create a queued task.
- `GET /agent-tasks`: list tasks, optionally filtered by status or owner.
- `GET /agent-tasks/:id`: fetch one task.
- `POST /agent-tasks/claim`: claim the next eligible task for an agent.
- `PATCH /agent-tasks/:id`: update task status, result summary, or error
  summary.

Validation rules:

- Request bodies must be JSON objects under the configured max body size.
- `type`, `createdBy`, and `input` are required when creating a task.
- Unknown task types are rejected.
- A task can only be claimed by an online or recently heartbeating agent.
- A running task cannot be claimed again until `claimExpiresAt` has passed.
- Completed, failed, or canceled tasks cannot be claimed.
- Result and error summaries must be bounded.
- Task input must not include filesystem paths unless the task type explicitly
  allows a tool-produced local path and Local Agent revalidates it.

## Local Agent Worker

Add a worker loop that can run separately from Slack Socket Mode:

```sh
npm run agent:worker
```

The worker should:

1. Register itself with Center Server.
2. Send periodic heartbeat.
3. Poll `POST /agent-tasks/claim`.
4. Execute supported task types through existing guarded code paths.
5. Report `completed` with a bounded result summary or `failed` with a bounded
   error summary.
6. Never expose local credential values or full source bodies to Center Server.

The first supported task type should be narrow:

```text
answer_question({ question: string })
```

It can call the existing guarded agent runner and Tool Registry. Later task
types can be added only after the lifecycle and lease behavior are proven.

## Agent Optimization Scope

This phase should improve the agent where it directly supports dispatch:

- Return structured task results with source summaries instead of Slack-only
  prose.
- Add task-level execution metadata: tool call count, source count, truncation
  flag, and failure category.
- Preserve current repeated-tool-call protection.
- Keep all retrieved content as untrusted context.
- Avoid adding new tools unless required by the task dispatch POC.

Defer broader agent planning, reflection, embeddings, and autonomous task
decomposition until durable dispatch is validated.

## Acceptance Criteria

- Center Server can register a Local Agent and record heartbeat state.
- A queued `answer_question` task can be created through HTTP or CLI.
- A Local Agent worker can claim one eligible task and move it to `running`.
- Two workers polling at the same time cannot claim the same task.
- A worker can complete a task and report a bounded result summary.
- A worker can fail a task and report a bounded error summary.
- A running task with an expired claim lease can be reclaimed.
- Completed, failed, and canceled tasks cannot be reclaimed.
- Center Server never stores local file bodies, email bodies, Google Docs
  bodies, OpenAI tokens, Google tokens, or Slack tokens.
- Existing Slack `find`, `ask`, and App DM conversation behavior remains
  unchanged.
- Tests cover repository lifecycle behavior, HTTP validation, claim lease
  behavior, worker happy path, worker failure path, and existing command
  regressions.

## Verification Plan

Automated:

- Repository tests for agent registration, heartbeat, create, claim, update,
  lease expiry, and terminal statuses.
- HTTP handler tests for new endpoints, malformed input, unknown ids, and
  invalid transitions.
- Worker tests using fake Center Server client and fake agent executor.
- Regression tests for current `find`, `ask`, and natural App DM behavior.
- Audit or memory tests proving source bodies and token values are not persisted
  centrally.

Manual UAT:

- Start Center Server.
- Start one Local Agent worker.
- Create an `answer_question` task by CLI or HTTP.
- Verify task reaches `completed` and contains a concise result.
- Start two workers and verify only one claims a new task.
- Stop a worker during `running`, wait for lease expiry, and verify another
  worker can reclaim.

## Implementation Slices

### Slice 1: Center Task Queue

Add `agent_tasks` repository, schema, validation, and HTTP endpoints. No worker
yet. Prove lifecycle state and lease rules with tests.

### Slice 2: Agent Registry

Add agent registration and heartbeat. Keep auth minimal for POC, such as a local
development shared secret, but make the boundary explicit.

### Slice 3: Local Worker

Add worker config, polling, claim, execution, result reporting, and focused
tests with fake clients.

### Slice 4: Slack Or CLI Entry

Expose task creation through a CLI first. Add Slack command integration only
after HTTP and worker behavior are stable.

## Deferred

- Moving Slack ingress to Center Server.
- Per-user active-agent routing from Slack events.
- Centralized Slack notifications for task completion.
- Full auth, RBAC, audit policy, and admin UI.
- PostgreSQL or hosted database migration.
- Long-running task cancellation UI.
- Rich App Home task dashboard.
- Distributed local index federation.

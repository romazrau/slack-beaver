# Remote Task Dispatch Planning

## Context

The project already has a validated Local Agent path for Slack, local file
search, guarded OpenAI-backed answers, Google Workspace read-only tools, local
memory, and a Center Server TODO API.

The next POC question is whether Slack Beaver can execute durable tasks across
machines without moving local files or credentials into Center Server.

## Decision

Plan the next hybrid slice as Remote Task Dispatch rather than adding more
individual tools first.

Center Server should own durable agent task state, agent registration,
heartbeat, claim leases, and result summaries. Local Agents should own actual
execution, local files, local memory, local credential files, Google OAuth
tokens, and OpenAI API keys.

Slack ingress should remain in the Local Agent for this phase unless a later
phase explicitly moves it to Center Server. The first dispatch path can be
driven by CLI or HTTP smoke commands.

## Rationale

The current synchronous agent loop is appropriate for direct Slack replies, but
remote execution needs a task lifecycle, retry behavior, and a lease model.

A small dispatch POC validates the important hybrid boundary without requiring
Central Slack ingress, full RBAC, browser automation, or a distributed search
index.

## Implementation

Implemented the first Remote Task Dispatch vertical slice:

- Added Center Server agent registry and heartbeat.
- Added durable `agent_tasks` queue with explicit lifecycle state.
- Added claim leases so only one Local Agent executes a task before lease expiry.
- Added a one-shot Local Agent worker that registers, heartbeats, claims,
  executes, and reports.
- Started with one narrow task type: `answer_question({ question: string })`.
- Reused existing guarded agent runner and Tool Registry for local execution.
- Added CLI smoke commands for registration, task creation, listing, and claim.

## Safety Boundaries

- Center Server must not store local file bodies, email bodies, Google Docs
  bodies, OpenAI tokens, Google tokens, or Slack tokens.
- Local Agent must revalidate all tool inputs through existing allowlist,
  denylist, size, extension, and bounded-output checks.
- Arbitrary shell commands and write/edit tools remain out of scope.

## Validation

- Repository and HTTP tests for lifecycle transitions, claim lease behavior,
  malformed input, terminal statuses, and missing ids passed.
- Worker tests with fake Center Server client and fake agent executor passed.
- `npm test -- tests/agentTaskRepository.test.ts tests/centerServer.test.ts tests/agentWorker.test.ts`
  passed under Node.js 22.23.1 with 14 tests.
- `npm run typecheck` passed under Node.js 22.23.1.
- `npm run verify` passed under Node.js 22.23.1 with 21 test files and 109
  tests, plus typecheck and build.
- CLI smoke passed against a temporary SQLite DB in `/tmp` for agent register,
  task create, task claim, and task list.
- Chrome UAT on 2026-06-29 confirmed this Chrome profile still blocks direct
  `127.0.0.1` navigation with `ERR_BLOCKED_BY_CLIENT`.
- Computer Use UAT on 2026-06-29 confirmed Computer Use can inspect Finder, but
  could not access Chrome's key window and returned `cgWindowNotFound`.
- Manual running-server UAT passed on 2026-06-29 against
  `http://127.0.0.1:4319`: the Local Agent one-shot worker claimed task `1` and
  completed it with bounded local AI token setup guidance.

## Deferred

- Central Slack ingress and Slack token migration.
- Multi-user routing from Slack events to active Local Agents.
- Full auth, RBAC, dashboard, and production database migration.
- Browser automation or unrestricted OS operations as task types.

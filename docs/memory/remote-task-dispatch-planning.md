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

## Planned Scope

- Add Center Server agent registry and heartbeat.
- Add durable `agent_tasks` queue with explicit lifecycle state.
- Add claim leases so only one Local Agent executes a task.
- Add a Local Agent worker loop that polls, claims, executes, and reports.
- Start with one narrow task type: `answer_question({ question: string })`.
- Reuse existing guarded agent runner and Tool Registry.

## Safety Boundaries

- Center Server must not store local file bodies, email bodies, Google Docs
  bodies, OpenAI tokens, Google tokens, or Slack tokens.
- Local Agent must revalidate all tool inputs through existing allowlist,
  denylist, size, extension, and bounded-output checks.
- Arbitrary shell commands and write/edit tools remain out of scope.

## Validation Plan

- Repository and HTTP tests for lifecycle transitions, claim lease behavior,
  malformed input, terminal statuses, and missing ids.
- Worker tests with fake Center Server client and fake agent executor.
- Regression tests for existing Slack `find`, `ask`, and App DM behavior.
- Manual UAT with one worker, two workers, and lease-expiry reclaim.

## Deferred

- Central Slack ingress and Slack token migration.
- Multi-user routing from Slack events to active Local Agents.
- Full auth, RBAC, dashboard, and production database migration.
- Browser automation or unrestricted OS operations as task types.

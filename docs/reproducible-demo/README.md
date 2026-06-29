# Reproducible POC Demo Plan

## Goal

Provide a repeatable demonstration plan for Slack Beaver as a self-hosted Slack
bot plus Local Agent system:

- Slack is the control surface.
- Local Agents operate local data through bounded tools.
- Center Server manages durable task state.
- The same task can be rerun from a known fixture state and produce comparable
  evidence across machines or agents.

This folder is intentionally demo-focused. It does not replace setup docs,
phase plans, or memory notes.

## Demo Scope

The reproducible demo has three layers:

1. Local Slack workflow: prove Slack can trigger a Local Agent on this computer
   to search and answer from allowlisted local data.
2. Center task workflow: prove Center Server can own task lifecycle state while
   a Local Agent worker claims and completes bounded work.
3. Multi-agent comparison workflow: prove two agent identities can run the same
   task against equivalent fixture data and produce comparable structured
   evidence.

## Out Of Scope

- Production auth, RBAC, billing, or tenant isolation.
- Central Slack ingress migration.
- Browser automation.
- Arbitrary shell command execution.
- Automatic writes to local files or Google Workspace.
- Exact natural-language answer matching across models.

## Required Evidence

Each completed demo run should capture:

- Git commit SHA.
- Node.js version.
- Fixture corpus version or path.
- Local Agent id and owner.
- Center Server DB path used for the run.
- Input question or Slack command.
- Task id when Center Server is used.
- Final task status.
- Tool call count when available.
- Source count or source summary when available.
- Truncation or error flag when available.
- Audit log shape, without full local file bodies or token values.

Use [evidence-template.md](evidence-template.md) for consistent run notes.

## Acceptance Criteria

The demo is considered reproducible when:

- A fresh operator can follow this folder plus linked setup docs without reading
  implementation source first.
- The local Slack demo can be repeated from a known fixture folder.
- The Center task demo can create, claim, complete, and list a task from a clean
  temporary SQLite DB.
- The multi-agent comparison demo can show that two agent identities do not
  claim the same task at the same time.
- Comparable runs are judged by structured metadata and cited sources, not by
  exact natural-language wording.
- No demo evidence records Slack tokens, OpenAI keys, Google tokens, full local
  file bodies, Gmail bodies, or Google Docs bodies.

## Recommended Run Order

1. [fixture-spec.md](fixture-spec.md): prepare or verify the fixture corpus.
2. [01-local-slack-agent-demo.md](01-local-slack-agent-demo.md): run the Slack
   local-data path.
3. [02-center-task-dispatch-demo.md](02-center-task-dispatch-demo.md): run the
   Center Server task lifecycle path.
4. [03-multi-agent-comparison-demo.md](03-multi-agent-comparison-demo.md): run
   the comparable multi-agent path.
5. [evidence-template.md](evidence-template.md): record results for reporting.

## Report Positioning

Use this demo folder to support the POC report with concrete claims:

- Local-first privacy: sensitive data stays on the user's machine.
- Slack-native operation: users do not need a separate desktop UI for the POC.
- Bounded tools: the agent can search/read only through registered tools.
- Durable task management: Center Server tracks queued, running, completed,
  failed, and canceled work.
- Multi-machine path: Center Server coordinates tasks while Local Agents keep
  execution and credentials local.

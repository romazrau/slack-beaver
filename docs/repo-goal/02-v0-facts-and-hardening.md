# Slack Local File Search v0 Facts And Hardening

## Context

Slack Local File Search v0 has passed the successful live Slack path:

```text
Slack /agent find Socket
  -> Slack Socket Mode
  -> Local Agent on this Mac
  -> allowlisted docs folder
  -> Slack ephemeral response
  -> JSONL audit log
```

The next phase should not add a new capability yet. It should freeze the verified facts, close the remaining manual UAT gaps, and make the demo state reproducible before starting Phase 5 local index cache or Phase 6 AI summary.

## Goal

Turn the current working v0 into a repeatable, evidence-backed demo baseline.

This phase answers three questions:

- What is actually configured and running?
- Which behaviors have been verified by tests or live UAT?
- What must be true before building the next capability?

## Facts To Record

The following facts should be recorded in repository documentation, without token values:

- Slack workspace used for UAT.
- Slack app name and app ID.
- Socket Mode enabled state.
- Slash command name, description, and usage hint.
- OAuth scopes used for v0.
- App-level token name, but not token value.
- Local `.env` keys that must be set, but not values for secrets.
- Watched folders and denylist folders used for UAT.
- Local daemon label and removal command.
- Verification commands and results.
- Live Slack UAT command and result count.
- Audit log shape and fields observed.
- Known remaining UAT gaps.

## Non-Goals

- Do not add SQLite indexing in this phase.
- Do not add AI summaries in this phase.
- Do not expand Slack scopes beyond what v0 needs.
- Do not add Google Workspace integration.
- Do not add file modification, shell execution, or desktop packaging.
- Do not commit `.env`, tokens, audit logs, or local runtime logs.

## Task Plan

### Task 1: Facts Inventory

Create or update documentation that lists the concrete facts of the current setup.

Acceptance criteria:

- App resources are identifiable and removable.
- Token handling is explicit and secret-safe.
- Local daemon operation is documented with start, check, and remove commands.
- The doc explains which facts are verified and which are assumptions.

Verification:

- Run a token-pattern scan against `README.md` and `docs/`.
- Confirm `.env` remains gitignored and uncommitted.

### Task 2: Remaining Manual UAT

Run and record the remaining manual UAT cases:

- Successful search.
- No-result query.
- Invalid or empty query.
- Denylist folder is not read.
- Oversized file is skipped.
- Local Agent stopped means Slack cannot search local files.

Acceptance criteria:

- Each case has expected behavior, observed behavior, and pass/fail status.
- Any failed case becomes a tracked implementation task before Phase 5.
- Audit log entries are checked for successful and failed searches.

Verification:

- Use Slack `/agent find <query>` for Slack-visible cases.
- Use local fixture folders where needed for denylist and oversized files.
- Inspect audit log shape without copying full file contents.

### Task 3: Automated Coverage Gap Review

Compare the manual UAT list with existing Vitest coverage.

Acceptance criteria:

- Existing tests are mapped to v0 acceptance criteria.
- Missing but practical tests are identified.
- High-risk gaps are converted into implementation tasks.

Verification:

```sh
npm test
npm run typecheck
git diff --check
```

### Task 4: Demo Runbook

Create a concise runbook for repeating the demo from a clean local state.

Acceptance criteria:

- Runbook starts from dependency install and `.env` setup.
- Runbook includes foreground and daemon startup options.
- Runbook includes Slack command examples.
- Runbook includes audit log inspection.
- Runbook includes cleanup commands.

Verification:

- A contributor should be able to follow the runbook without reading the full conversation history.

### Task 5: Phase 5 Readiness Decision

Decide whether the next implementation phase should be local index cache or AI summary.

Recommended decision:

- Choose local index cache first if direct scan latency or repeated searches become a demo problem.
- Choose AI summary first only if current search snippets are already sufficient and the next demo needs higher-level answer quality.

Acceptance criteria:

- Decision is recorded in `docs/memory/`.
- The selected phase has clear acceptance criteria before implementation starts.

## Deliverables

- Updated facts memory under `docs/memory/`.
- Updated `README.md` or a dedicated runbook if the setup steps change.
- UAT checklist with observed results.
- Test coverage gap list.
- Phase 5 readiness decision.

## Definition Of Done

- No real Slack token values appear in tracked files.
- `git status --short` is clean after commit.
- `npm test` passes.
- `npm run typecheck` passes.
- `git diff --check` passes.
- Remaining manual UAT results are documented.
- Next implementation phase is explicitly selected or intentionally deferred.

## Execution Results

Execution date: 2026-06-28

Completed:

- Facts inventory updated in `docs/memory/v0-facts-hardening-results.md`.
- Repeatable demo runbook added in `docs/runbooks/slack-local-file-search-v0.md`.
- Fixture UAT passed for successful search, no result, denylist skip, oversized skip, and empty query rejection.
- Audit log shape was inspected with fake UAT user/channel IDs and did not include full file contents.
- `.env` was restored to the docs demo folder after fixture UAT and remained mode `600`.
- Coverage gap review was documented.
- Phase 5 was intentionally deferred.

Blocked for live Slack UI in this execution:

- Remaining Slack-visible UAT commands could not be sent because Chrome UI automation was unavailable in this turn.
- The commands and expected results are documented in the runbook for manual execution.

Decision:

- Do not start SQLite local index cache yet.
- Next practical work is Phase 4.5 demo hardening: finish Slack-visible UAT, decide invalid-command audit behavior, and replace ad hoc `launchctl submit` with either foreground-only documentation or a real LaunchAgent plist template.

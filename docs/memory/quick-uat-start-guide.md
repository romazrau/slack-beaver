# Quick UAT Start Guide

## Context

Manual UAT now has several startup paths because the project includes a Slack
Local Agent, local memory, local OpenAI token setup, optional Google Workspace
tokens, and a Center Server TODO API.

The existing setup and runbook documents are detailed, but a short operator
guide is useful for repeating UAT without reading every setup note.

## Decision

Add `docs/runbooks/quick-uat-start.md` as the quick-start UAT entry point.

The guide covers three states:

- First startup, including Slack token setup and AI agent token setup pointers.
- Resume startup when local setup already exists.
- Reset-state startup when local memory should be cleared before UAT.

The guide links to `docs/setup/slack-api-and-local-runtime.md` for full Slack
app, token, secret-handling, local folder, and AI token setup details instead of
duplicating every setup rule.

Add one-line npm startup commands backed by `scripts/uat-start.cjs`:

- `npm run uat:first`
- `npm run uat:resume`
- `npm run uat:reset`

## Notes

- First startup explicitly warns not to paste Slack tokens or OpenAI API keys
  into Slack.
- Reset-state startup documents that SQLite local memory is cleared, but token
  files and `.env` are kept.
- Center Server TODO UAT is included as an optional part of each path.
- First and reset startup default to this repository's `doc-test/` fixture
  folder, assembled from the repository root at runtime.
- `UAT_FOLDER` can override the default fixture folder for first and reset
  startup.

## Validation

- `tests/uatStartScript.test.ts` covers unknown startup mode, dry-run resume
  behavior without starting the Local Agent, and the repository-local default
  UAT fixture folder.
- `npm run verify` passed with 19 test files and 92 tests.

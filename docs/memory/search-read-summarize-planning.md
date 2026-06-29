# Search, Read, And Summarize Planning

## Decision

Add `docs/repo-goal/10-search-read-summarize.md` as the next feature plan.

The next product improvement should make the agent reliable when a search
snippet is not enough. The planned flow is search first, read the most relevant
bounded sources only when needed, then summarize or answer with citations.

## Implementation Result

Implemented on 2026-06-29.

Changes:

- Added `local_file_read` as a read-only Tool Registry tool.
- Added bounded local file reads behind allowlist, denylist, supported
  extension, max-file-size, and text-read checks.
- Updated agent instructions to search first, read the top one to three relevant
  sources only when snippets are insufficient, and cite sources.
- Updated the agent-readable tool catalog to include `local_file_read`.
- Kept deterministic `find <query>` search-only.
- Added fake-client coverage for local search/read, Gmail search/read, and
  Google Drive search plus Docs read.
- Added audit safety coverage so local file, email, and document bodies are not
  written to JSONL audit logs.

## Scope

- Add a read-only local file content tool behind Tool Registry validation.
- Keep deterministic `find <query>` search-only.
- Update agent instructions so `ask <question>` and natural App DM conversation
  can use local and Google search/read tool pairs.
- Keep Google Workspace read-only with existing Gmail, Drive, and Docs tools.
- Keep audit logs body-safe by recording summaries rather than retrieved
  content.

## Token Access Record

OpenAI:

- `List models: Read`
- `Responses: Write`

Google OAuth:

- `openid`
- `email`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/documents.readonly`

Slack:

- Bot scopes: `commands`, `chat:write`, `im:history`
- Bot events: `app_home_opened`, `message.im`
- App-level Socket Mode scope: `connections:write`

The plan explicitly excludes write, delete, send, sharing, admin, billing,
fine-tuning, file upload, image, audio, realtime, transcription, and TTS access
for this phase.

## Validation Intent

Implementation should include tests for local read access policy, Tool Registry
input rejection, local search/read answer flow, Google search/read answer flow,
and audit safety.

Validation completed:

- `npm test -- tests/localSearch.test.ts tests/agentCommands.test.ts` passed
  under Node.js 22.23.1.
- `npm run verify` passed under Node.js 22.23.1 with 19 test files and 99
  tests.

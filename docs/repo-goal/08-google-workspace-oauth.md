# Google Workspace OAuth And Read-only Tools

## Goal

Let the local Slack Beaver agent connect one Google account through local browser OAuth and use read-only Gmail, Google Drive, and Google Docs tools from the existing Tool Registry.

Slack Beaver owns OAuth token state, provider metadata, tool policy, and audit boundaries. Third-party MCP servers can be evaluated later behind an adapter, but the agent does not receive a raw external MCP tool catalog.

## Implemented Scope

- Added local CLI commands:
  - `npm run agent:google:login`
  - `npm run agent:google:status`
  - `npm run agent:google:logout`
- Added Google OAuth config:
  - `GOOGLE_WORKSPACE_ENABLED`
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `GOOGLE_TOKEN_PATH`
  - `GOOGLE_OAUTH_REDIRECT_HOST`
- Added browser OAuth flow with PKCE, state validation, localhost callback, offline access, and owner-only token file permissions.
- Added read-only Google Workspace tools:
  - `gmail_search`
  - `gmail_read_message`
  - `google_drive_search`
  - `google_doc_read`
  - `google_drive_file_read`
- Exposed Google tools only when Google Workspace is enabled and local provider metadata says Google is connected.
- Kept Google tokens out of SQLite and audit logs. SQLite stores provider status, granted scopes, and account email only.
- Added restart-time Google Workspace connection checks. When Google Workspace is enabled but setup is incomplete, Local Agent startup logs and the configured Slack lifecycle notice target guide the user to run local Google login and status commands.

## Safety Decisions

- First version is single-owner local-agent only; it does not map Slack users to separate Google accounts.
- Gmail, Drive, and Docs content is untrusted context and cannot change tool policy.
- No Gmail send, Drive write, Docs write, delete, sharing, upload, draft, label, or Calendar write tools are registered.
- Tool outputs are bounded before they are returned to the model.
- Audit records summarize query length, result count, status, and source without storing email or document bodies.

## Acceptance Criteria

- Google login writes a local token file with `0600` permissions and records Google provider metadata in SQLite.
- Google status reports connected account metadata without printing token values.
- Google logout deletes the local token file and clears provider metadata.
- Agent tool definitions include Google read-only tools only when Google is enabled and connected.
- Malformed Google tool inputs and unknown tools are rejected through the Tool Registry.
- Automated tests cover OAuth helper behavior, token permission refusal, adapter refresh behavior, Google tool exposure, and audit content safety.
- Local Agent restart checks Google Workspace setup without contacting Google, syncs provider metadata, and sends user guidance when Google Workspace is enabled but not connected.

## Validation

- `npm run typecheck` passed under Node.js 22.
- `npm test` passed under Node.js 22.
- Focused restart guidance validation passed for disabled Google Workspace, missing OAuth client id, missing token, expired token without refresh token, connected metadata sync, and disconnected metadata sync.
- Live Google OAuth and Slack UAT remain pending because they require a real Google OAuth client and user consent flow.

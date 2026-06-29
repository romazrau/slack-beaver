# Google Workspace OAuth

## Decision

Slack Beaver now owns Google OAuth onboarding and read-only Google Workspace tool exposure directly instead of delegating trust boundaries to a third-party MCP server.

The third-party `taylorwilsdon/google_workspace_mcp` project remains a possible future adapter layer, but the current agent only sees Slack Beaver registered tools from the Tool Registry.

## Implementation Notes

- Added local Google CLI commands for login, status, and logout.
- Added Google OAuth config and token path handling.
- Token files are saved under `GOOGLE_TOKEN_PATH` with owner-only permissions.
- SQLite stores only Google provider metadata, granted scopes, and account email.
- Added read-only Gmail, Drive, and Docs tools behind Tool Registry validation.
- Google tools are visible to the model only when `GOOGLE_WORKSPACE_ENABLED=true` and the Google provider is marked connected.
- Gmail and document content is treated as untrusted context and excluded from audit logs.
- Local Agent startup now checks Google Workspace setup on every restart without contacting Google. When Google Workspace is enabled, it validates the local OAuth client id, token file readability, token shape, owner-only permissions, and whether an expired access token can be refreshed later.
- Startup check results are synced into SQLite provider metadata before the online runtime notice is formatted, so Slack status reflects the latest local Google connection state.
- If Google Workspace is enabled but setup is incomplete, startup logs and the configured Slack lifecycle notice target guide the user to run `npm run agent:google:login` and verify with `npm run agent:google:status`. The guidance never asks users to paste Google tokens into Slack.

## Validation

- OAuth helper tests cover PKCE generation, state validation, missing-token guidance, and broad-permission token refusal.
- Google Workspace adapter tests cover refresh-token handling and bounded Docs output.
- Agent command tests cover Google tool catalog exposure and Gmail search without auditing email content.
- Startup guidance tests cover disabled Google Workspace, missing OAuth client id, missing token, expired token without refresh token, connected metadata sync, and disconnected metadata sync.
- `npm run typecheck` passed with Node.js 22.
- `npm test` passed with Node.js 22.
- Live Google OAuth UAT passed on 2026-06-29 with a Google Cloud project configured for Gmail API, Google Drive API, Google Docs API, Google Auth Platform testing audience, one test user, and a desktop OAuth client. Local `.env` stores the client ID and secret; `tokens/google-oauth.json` was created with `0600` permissions.
- The tested Chrome profile displayed `ERR_BLOCKED_BY_CLIENT` on the final `127.0.0.1` callback page, but the localhost callback still reached the helper and `npm run agent:google:status` confirmed the connected account and read-only scopes.

## Pending

- Run Slack DM UAT with real Gmail/Drive/Docs read-only queries.
- Decide whether future multi-user routing needs per-Slack-user Google token storage.

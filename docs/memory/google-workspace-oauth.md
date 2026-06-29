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

## Validation

- OAuth helper tests cover PKCE generation, state validation, missing-token guidance, and broad-permission token refusal.
- Google Workspace adapter tests cover refresh-token handling and bounded Docs output.
- Agent command tests cover Google tool catalog exposure and Gmail search without auditing email content.
- `npm run typecheck` passed with Node.js 22.
- `npm test` passed with Node.js 22.

## Pending

- Configure a real Google OAuth client and run local browser login UAT.
- Run Slack DM UAT with real Gmail/Drive/Docs read-only queries.
- Decide whether future multi-user routing needs per-Slack-user Google token storage.

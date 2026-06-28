# Agent Token Onboarding Plan

## Goal

Make AI agent token setup discoverable from both repository documentation and the Slack App Home surface, without weakening the rule that API keys and paid tokens must never be pasted into Slack.

## Scope

- Rename user-facing setup guidance from generic OpenAI token wording to AI agent token wording.
- Keep the implementation explicit that the local AI agent token is currently an OpenAI API key.
- Show the exact local CLI command where users are most likely to look: README, setup docs, Slack App Home, and Slack setup/error guidance.
- Preserve local-only token entry through `npm run agent:secrets:set-openai`.

## Acceptance Criteria

- README has a clear "Enable AI Answers" path for `ask <question>`.
- Slack App Home shows token status plus the local setup command when the token is missing.
- Slack App Home shows a ready state when the token is configured.
- Chat guidance for missing or pasted tokens tells the user to use the local CLI and not paste secrets into Slack.
- Local token setup CLI can run before Slack bot/app tokens are configured.
- Npm commands fail early with actionable `nvm use` guidance when the active Node major version does not match the native SQLite build target.
- Server startup prints local AI agent token setup guidance when the token is missing.
- No token values or token file contents are exposed in Slack or documentation.

## Verification

- Unit tests cover App Home missing-token guidance, configured-token ready state, missing-token chat guidance, and token-like Slack refusal.
- Unit tests cover local setup CLI execution without Slack tokens.
- Unit tests cover Node version preflight guidance and startup token guidance.
- Run `npm run verify` under Node.js 22.

## Result

Implemented the onboarding copy, App Home state updates, and local CLI config relaxation. The local-only token setup boundary remains unchanged.

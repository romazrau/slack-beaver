# Agent Token Onboarding

## Context

Users could see that the OpenAI token was not configured, but the README and Slack App Home did not make the next local setup action obvious enough. The Home tab only said "Local CLI only", which preserved the security boundary but did not guide users to the actual command.

Live verification in VS Code also showed that `npm run agent:secrets:set-openai` was blocked by Slack token validation before the user could enter the local AI token.

A later live attempt showed the same command could still fail before prompting when VS Code had drifted to Node.js 24 while `better-sqlite3` was built for Node.js 22.

## Decision

Use "AI agent token" as the user-facing setup label, while documenting that the current token is an OpenAI API key stored locally. Show the local setup command directly in README, setup docs, Slack App Home, and Slack setup/error responses.

## Reason

AI answers and natural App DM conversation depend on this setup. The flow should tell users what to do next without inviting them to paste paid API keys into Slack.

## Implementation

- Added shared AI agent token setup copy.
- Updated Slack App Home to show an "Enable AI answers" section when token setup is missing.
- Updated Slack App Home to show a ready state when the token is configured.
- Updated chat guidance for missing tokens and token-like Slack messages.
- Updated README and setup docs with a dedicated AI answer enablement path.
- Updated local CLI config loading so setup commands load `.env` and do not require Slack bot/app tokens.
- Added npm preflight Node major checks before native SQLite bindings load.
- Added Local Agent startup guidance when the AI agent token is missing.

## Validation

- App Home tests cover missing-token setup guidance and configured-token ready state.
- Agent command tests cover clearer missing-token and token-refusal guidance.
- Local CLI tests cover setup command execution without Slack tokens.
- Node version preflight tests cover the passing path and actionable `nvm use` failure guidance.
- Startup guidance tests cover terminal setup instructions for missing AI agent tokens.
- CLI smoke testing confirmed `npm run agent:secrets:set-openai` can save a fake token to temporary local paths without Slack tokens.
- Node.js `v24.18.0` smoke testing confirmed `npm run agent:secrets:set-openai` now exits before `better-sqlite3` loads and prints `nvm use` plus `npm rebuild better-sqlite3` guidance.
- Node.js `v22.23.1` smoke testing confirmed `npm run agent:secrets:set-openai` still saves a fake token to temporary local paths after the preflight passes.
- Chrome live validation confirmed Slack App Home shows `AI agent token`, `Enable AI answers`, `npm run agent:secrets:set-openai`, and the no-Slack-secret warning.
- Chrome live validation confirmed a new App Messages `help` request returns the updated AI agent token setup steps.
- Computer validation showed VS Code's terminal had drifted to Node.js `v24.18.0`; live validation used an explicit Node.js `v22.23.1` Local Agent process.
- `npm run verify` passed under Node.js `v22.23.1`.

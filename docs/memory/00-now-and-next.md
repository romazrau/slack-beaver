# Now and Next

## Current State

- Repo now has Slack Local File Search v0 implemented and live-tested with a real internal Slack app.
- `docs/repo-goal/00-poc.md` defines the Slack-based Local AI Ops Agent three-day POC.
- `docs/repo-goal/01-accelerated-local-file-search.md` narrows the immediate plan to a Slack bot that can locally search allowlisted files and explains the Local Agent runtime decision.
- `docs/repo-goal/02-v0-facts-and-hardening.md` defines the next phase: facts inventory, remaining manual UAT, coverage gap review, demo runbook, and Phase 5 readiness decision.
- `README.md` is now a compact entry point for starting the Local Agent server, running verification, seeing current features, and navigating deeper docs.
- `docs/setup/slack-api-and-local-runtime.md` now owns Slack app settings, local `.env` setup, secret handling, local CLI setup commands, and optional `launchctl submit` demo notes.
- `.gitignore` now protects local dependencies, build outputs, secrets, SQLite runtime files, logs, caches, and local OAuth/token artifacts.
- Source code includes config validation, guarded direct local search, Slack `/agent find <query>` command handling, Slack App Home / Messages chat handling, and JSONL audit logging.
- A real Slack app named `Slack Beaver Local Agent` exists in the `For Coding` workspace with Socket Mode enabled and `/agent find <query>` configured.
- The same Slack app now has App Home Home tab, Messages tab, Event Subscriptions, bot events, and bot scopes configured for Slack-native app chat.
- The Slack app uses `assets/slack-beaver-local-agent-avatar.png` as its app icon.
- `docs/runbooks/slack-local-file-search-v0.md` now provides the repeatable v0 demo runbook.
- `doc-test/` now provides a synthetic local-search fixture corpus with nested Markdown, TXT, CSV, and JSON files for manual validation.
- `launchctl submit` is documented as optional demo convenience only; foreground `npm run dev` remains the reliable v0 demo path.
- `docs/memory/slack-app-home-chat.md` records the decision to use Slack-native App Home chat instead of a desktop app.
- `docs/memory/readme-documentation-scope.md` records the decision to keep operational setup and planning details out of README.
- `docs/repo-goal/03-local-memory-and-ai-agent.md` now records the implemented Local Memory and OpenAI token safety slice.
- `docs/repo-goal/04-openai-agent-runner.md` now defines the next phase for a guarded OpenAI-backed `ask <question>` flow.
- `docs/repo-goal/05-agent-conversation-context-and-tools.md` now defines and tracks the App DM natural conversation mode, agent-readable tool catalog, and 8-turn context summarization policy.
- `docs/repo-goal/07-openai-model-selection.md` defines local CLI OpenAI model discovery and switching acceptance criteria.
- `docs/repo-goal/08-google-workspace-oauth.md` defines and records local Google OAuth onboarding plus read-only Gmail, Drive, and Docs agent tools.
- `docs/repo-goal/00-poc.md` now explicitly records that multiple Local Agents and Central Server routing are future work; the current POC remains single-owner / single-active-agent.
- `docs/memory/local-memory-and-ai-agent.md` records the SQLite memory, OpenAI-only, local CLI token setup, and original deferred full OpenAI agent decisions.
- `docs/memory/agent-conversation-context-and-tools.md` records the defaults, scope, implementation result, and validation for the conversation context and tool catalog phase.
- `docs/memory/future-hybrid-routing.md` records the future boundary: Central Server owns Slack ingress and Local Agents become user-owned workers when multi-user routing is introduced.
- Source code now includes SQLite local memory, folder setup CLI, local memory reset with double confirmation, OpenAI token local setup, App Home setup guidance, Slack token-like refusal, and a local search Tool Registry path.
- Source code now includes a guarded OpenAI-backed `ask <question>` runner that can only use validated Tool Registry `local_search` calls.
- Source code now includes App DM natural conversation, persisted conversation turns, overflow summarization, summary-plus-recent context retention, and a Tool Registry-backed agent-readable tool catalog.
- Source code now includes local CLI OpenAI model discovery and switching, with `gpt-5.5` as the default model and selected model state stored in SQLite settings.
- Source code now includes local CLI Google OAuth login/status/logout, owner-only Google token file handling, and read-only Gmail, Drive, and Docs Tool Registry tools.
- Slack App Home and README now show a clearer local-only AI agent token setup path for enabling `ask <question>` and natural AI answers.
- Npm scripts now check the active Node major version before loading native SQLite bindings, and Local Agent startup prints AI agent token setup guidance when the token is missing.
- Source code is now grouped by responsibility under `src/agent`, `src/cli`, `src/config`, `src/memory`, `src/observability`, `src/search`, `src/setup`, and `src/slack`.
- Local development and runtime commands now standardize on Node.js 22 through `.nvmrc`, `.node-version`, and `package.json` engines to keep `better-sqlite3` native bindings ABI-compatible.

## Validation Status

- Application logic and tests now exist.
- Automated verification passed with `npm test` and `npm run typecheck`.
- Live Slack UAT passed for `/agent find Socket` in Slack `#社交`, returning 3 matches from the allowlisted `docs` folder.
- `logs/audit.jsonl` recorded the successful search without full file contents.
- `@slack/bolt` runtime loading required an ESM/CommonJS interop fix, committed as `923cce3 fix(slack): load Bolt app in ESM runtime`.
- Fixture UAT passed for successful search, no result, denylist skip, oversized skip, and empty query rejection.
- Chrome-visible Slack UAT passed after Chrome was restarted: successful search, no-result search, invalid command, and Local Agent offline behavior.
- Automated tests now cover the shared command executor, App Home view safety, audit `source`, and direct-message guard.
- Chrome and Computer Use live UAT passed for App Home chat: Home tab rendered safe status, Messages tab `find Socket` returned local file results, invalid app message returned chat-specific usage, no-result query returned a clear no-result response, and audit log recorded `source=app_home_message`.
- Chrome and Computer Use verified the updated app icon in Slack app chat and the sidebar.
- `doc-test/` directory depth was checked to stay within five levels from the fixture root.
- Local Memory/token safety verification passed with automated tests and typecheck. Reset behavior requires local double confirmation and cannot be triggered directly from Slack.
- Chrome live UAT passed for the initialized Local Memory state: App Home showed setup guidance and OpenAI token local-only status, `find Socket` returned folder setup guidance, `reset memory` returned local-only double-confirmation instructions, and a fake token-like message was refused with local CLI guidance. Follow-up copy now uses a clearer setup checklist and states that folders plus OpenAI token setup are prerequisites before using AI answers. Computer Use instructions were read, but no direct Computer Use UI MCP was exposed in that turn.
- Project cleanup typecheck passed after moving modules into responsibility-based folders. `npm run verify` is now the preferred local gate before future commits.
- OpenAI agent runner automated validation covers fake-client `local_search`, unknown tool rejection, malformed input rejection, token-file permission checks, and existing `find` compatibility. Live Slack/OpenAI UAT remains pending.
- App DM conversation context validation covers natural conversation routing, no-folder conversation, persisted turns, context separation, 8-turn retention defaults, overflow summarization, summary-plus-recent context, no-tool summarizer calls, and Tool Registry catalog metadata. Live Slack/OpenAI UAT remains pending.
- VS Code terminal running Node.js `v22.23.1` successfully rebuilt `better-sqlite3` after a Node 20/22 native ABI mismatch; Node 22 smoke testing loaded `better-sqlite3` with `NODE_MODULE_VERSION 127`, and `npm run verify` passed.
- Agent token onboarding validation passed with focused App Home / command / local CLI / Node preflight tests, Node 24 failure-path smoke testing, Node 22 temporary-path CLI smoke testing for `npm run agent:secrets:set-openai`, Chrome live App Home and Messages verification, and the full `npm run verify` gate under Node.js `v22.23.1`.
- OpenAI model selection automated validation covers selectable Responses text model filtering, CLI current/list/set behavior, invalid model rejection, SQLite reset behavior, and runtime model precedence.
- Google Workspace OAuth automated validation covers PKCE generation, OAuth state validation, token-file permission refusal, refresh-token handling, bounded Docs output, conditional Google tool exposure, and audit safety for Gmail search.

## Likely Next Work

- Configure a real Google OAuth client and run local browser login plus Slack DM UAT for Gmail, Drive, and Docs read-only queries.
- Run live Slack UAT for App DM natural conversation and `ask <question>` with a real local OpenAI token.
- Expand prompt-injection fixtures beyond the current unknown-tool and malformed-input tests.
- Replace ad hoc `launchctl submit` with either foreground-only docs or a real LaunchAgent plist template.
- Keep Phase 5 local index cache deferred until v0 Slack-visible UAT and daemon/runbook gaps are closed.
- Keep Central Server, multi-agent routing, and task dispatch deferred until the current single-active-agent POC is validated.

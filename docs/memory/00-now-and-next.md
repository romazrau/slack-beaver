# Now and Next

## Current State

- Repo now has Slack Local File Search v0 implemented and live-tested with a real internal Slack app.
- `docs/repo-goal/00-poc.md` defines the Slack-based Local AI Ops Agent three-day POC.
- `docs/repo-goal/01-accelerated-local-file-search.md` narrows the immediate plan to a Slack bot that can locally search allowlisted files and explains the Local Agent runtime decision.
- `docs/repo-goal/02-v0-facts-and-hardening.md` defines the next phase: facts inventory, remaining manual UAT, coverage gap review, demo runbook, and Phase 5 readiness decision.
- `README.md` now describes the Local Agent runtime, Slack Socket Mode flow, setup, run, test, demo commands, For Coding workspace setup notes, daemon commands, and live UAT result.
- `.gitignore` now protects local dependencies, build outputs, secrets, SQLite runtime files, logs, caches, and local OAuth/token artifacts.
- Source code includes config validation, guarded direct local search, Slack `/agent find <query>` command handling, Slack App Home / Messages chat handling, and JSONL audit logging.
- A real Slack app named `Slack Beaver Local Agent` exists in the `For Coding` workspace with Socket Mode enabled and `/agent find <query>` configured.
- The same Slack app now has App Home Home tab, Messages tab, Event Subscriptions, bot events, and bot scopes configured for Slack-native app chat.
- `docs/runbooks/slack-local-file-search-v0.md` now provides the repeatable v0 demo runbook.
- `launchctl submit` is documented as optional demo convenience only; foreground `npm run dev` remains the reliable v0 demo path.
- `docs/memory/slack-app-home-chat.md` records the decision to use Slack-native App Home chat instead of a desktop app.

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

## Likely Next Work

- Decide whether invalid `/agent` and invalid App Home message attempts should be audited.
- Replace ad hoc `launchctl submit` with either foreground-only docs or a real LaunchAgent plist template.
- Keep Phase 5 local index cache deferred until v0 Slack-visible UAT and daemon/runbook gaps are closed.

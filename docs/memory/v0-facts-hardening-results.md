# v0 Facts Hardening Results

## Date

2026-06-28

## Scope

Executed the `docs/repo-goal/02-v0-facts-and-hardening.md` phase as far as the local workspace tools allowed.

The goal was to freeze verified facts, close repo-verifiable UAT gaps, create a repeatable runbook, and decide the next implementation direction before adding new capabilities.

## Verified Facts

- Slack Local File Search v0 is implemented.
- The Slack app is `Slack Beaver Local Agent` in the `For Coding` workspace.
- Socket Mode is enabled.
- `/agent find <query>` is configured.
- Actual Slack token values are stored only in local `.env`.
- `.env` remains gitignored and was checked as mode `600`.
- Current demo watched folder was restored to `/Users/romazrau/dev/slack-beaver/docs` after fixture UAT.
- Current demo denylist was restored to `/Users/romazrau/.ssh,/Users/romazrau/Library` after fixture UAT.
- `npm test` and `npm run typecheck` remain the required automated checks.

## Fixture UAT

A temporary watched folder was created under the OS temp directory with:

- One allowlisted match file.
- One denylisted file containing a unique query.
- One oversized file containing a unique query.

The Local Agent `.env` non-secret settings were temporarily pointed to this fixture, then restored to the docs demo configuration after verification.

Executed local fixture cases:

| Case | Query | Expected | Observed | Status |
| --- | --- | --- | --- | --- |
| Successful search | `alpha-visible` | 1 result | 1 result, `runtime-facts.md` | Pass |
| No result | `missing-needle` | 0 results | 0 results | Pass |
| Denylist skip | `deny-secret-hit` | 0 results | 0 results | Pass |
| Oversized skip | `oversized-hit` | 0 results | 0 results | Pass |
| Empty query | blank string | Error | `Search query cannot be empty.` | Pass |

Audit-equivalent JSONL entries were written with fake UAT user/channel IDs. The observed shape included:

- `timestamp`
- `slackUserId`
- `channelId`
- `query`
- `resultCount`
- `status`

No full file contents were written to the audit log.

## Slack UI UAT Status

Earlier live Slack UAT already passed for:

- `/agent find Socket` in Slack `#社交`.
- 3 results returned from the allowlisted `docs` folder.
- Ephemeral response visible only to the requester.
- Audit log entry written without full file contents.

This execution could not complete the remaining Slack-visible commands because the available automation tools could not operate the active Chrome/Slack UI:

- Chrome CDP was not available.
- AppleScript/System Events calls stalled under macOS permissions.
- Computer Use was not available in this turn.

The remaining Slack-visible cases are therefore documented in `docs/runbooks/slack-local-file-search-v0.md` for manual execution:

- No-result response in Slack.
- Invalid command response in Slack.
- Denylist skip via Slack against a fixture config.
- Oversized skip via Slack against a fixture config.
- Slack behavior while the Local Agent is offline.

## Daemon Finding

Foreground `npm run dev` remains the reliable v0 demo path.

`launchctl submit -l slack-beaver-local-agent ...` can be used as an optional demo convenience, but this phase found it is not reliable enough to treat as finished daemon packaging:

- The label can be removed with `launchctl remove slack-beaver-local-agent`.
- A later `launchctl list slack-beaver-local-agent` may fail if the submitted job has exited.
- A robust persistent daemon should use a LaunchAgent plist template in a later hardening phase.

## Coverage Gap Review

Existing automated coverage maps to v0 acceptance criteria:

| Acceptance area | Existing coverage |
| --- | --- |
| Config validation | `tests/config.test.ts` |
| Watched folder allowlist | `tests/localSearch.test.ts` |
| Path traversal rejection | `tests/localSearch.test.ts` |
| Denylist enforcement | `tests/localSearch.test.ts` |
| Supported extension filtering | `tests/localSearch.test.ts` |
| Oversized file skip | `tests/localSearch.test.ts` |
| Filename/content search | `tests/localSearch.test.ts` |
| Result limit | `tests/localSearch.test.ts` |
| Empty query rejection | `tests/localSearch.test.ts` |
| Slack command parsing | `tests/slackResponses.test.ts` |
| No-result formatting | `tests/slackResponses.test.ts` |
| Slack escaping | `tests/slackResponses.test.ts` |
| Audit log writer shape | `tests/auditLog.test.ts` |

Remaining useful test gaps:

- Integration-style test for `createSlackApp` command handler with mocked `ack`, `respond`, search, and audit dependencies. This likely needs light dependency injection before it is clean.
- Explicit test for invalid `/agent` command not writing an audit entry, or a product decision to audit invalid attempts.
- LaunchAgent plist validation if persistent daemon packaging becomes in scope.

## Phase 5 Readiness Decision

Do not start SQLite local index cache yet.

Reason:

- Direct scan is sufficient for the current demo folder.
- Remaining risk is demo reproducibility and Slack-visible UAT coverage, not search latency.
- Adding SQLite now would increase moving parts before v0 is fully hardened.

Next recommended phase:

```text
Phase 4.5: Demo hardening and Slack-visible UAT completion
```

This should include:

- Complete the remaining Slack UI UAT manually or with restored Computer Use.
- Decide whether invalid commands should be audited.
- Replace ad hoc `launchctl submit` with either foreground-only docs or a real LaunchAgent plist template.

Only after that should Phase 5 choose between local index cache and AI summary.

# Agent Retrieval UAT Hardening

## Goal

Turn the Slack/OpenAI UAT findings from the retrieval reviewer phase into a
concrete hardening plan with explicit acceptance criteria.

The next implementation should make `ask <question>` and natural App DM
conversation complete the search/read/review loop for real fixture questions,
not just avoid bad raw-match answers.

## UAT Context

Live Slack UAT was run through Chrome against the Slack Beaver Local Agent DM.
The Local Agent was started with Node.js `v22.23.1` and connected through Slack
Socket Mode. The effective readable folders shown by `folders list` were:

- `/Users/romazrau/dev/doc-test`
- `/Users/romazrau/dev/slack-beaver/docs`
- `/Users/romazrau/dev/whisper`

Computer Use could not inspect the Chrome window in this run:

- `Google Chrome`: `cgWindowNotFound`
- `Chrome`: invalid app

Chrome plugin automation remained usable for Slack DM verification.

An initial UAT pass found two Local Agent processes connected to Slack at the
same time. That made Slack replies and trace logs disagree. The duplicate
processes were stopped, and UAT continued with one Local Agent process.

## UAT Results

Passing behavior:

- `folders list` showed the expected effective readable scope.
- A vague Chinese request for a local short passage suitable for today's mood
  asked a focused clarification before searching.
- A short reply such as `安靜` was carried into the previous short-passage
  request. `logs/agent-traces/2026-06-29.jsonl` recorded
  `clarification_follow_up` with the effective question.
- The short-passage flow no longer returned raw `00-poc.md` matches.
- Deterministic `find` worked against the external `/Users/romazrau/dev/doc-test`
  fixture folder:
  - `find copper umbrella` found `the-copper-umbrella.md`.
  - `find TODO owner Priya` found `week-27.json` and `q3-rollout.md`.
  - `find Polar Dawn station` found `field-dispatches.md`.

Failing or incomplete behavior:

- `安靜` found useful candidates (`station-rain.txt` and
  `the-copper-umbrella.md`) but did not read and select one before hitting the
  tool-turn limit. The Slack reply asked for more source/style guidance instead
  of returning a selected passage.
- `ask In local files, what TODO mentions owner Priya?` searched useful
  candidates but read `README.md` first because it contains fixture search-hint
  text. The reviewer then requested reading `week-27.json` or `q3-rollout.md`,
  but the user-facing answer was the reviewer instruction itself rather than a
  completed answer.
- `ask Which file mentions quiet courage?` returned insufficient context because
  that fixture exists in this repo's `doc-test/`, while the live Slack readable
  scope pointed at the external `/Users/romazrau/dev/doc-test`.

## Root Causes

- Tool turn budgeting is too tight for search-heavy flows. The model may spend
  two turns on query refinement and only request `local_file_read` at the turn
  boundary.
- `needs_more_context` reviewer feedback can leak as a user-facing final answer
  instead of being forced through another tool step or a clear
  insufficient-context response.
- Search result ordering favors broad search-hint files such as README or
  memory docs before the real content files.
- The live fixture scope differs from the repository fixture scope, so test
  cases must be chosen from the actual effective readable folders.
- Multiple Local Agent processes can connect to Slack simultaneously, making UAT
  nondeterministic unless checked before testing.

## Hardening Plan

### Tool Loop Completion

- Allow one final read step when the agent reaches the tool-turn boundary and
  the pending tool call is a read for a path returned by prior search results.
- Alternatively split budgets into search turns and read turns so a
  search-heavy plan cannot consume the entire budget before the first read.
- Keep repeated-tool-call detection active for identical search/read inputs.

### Reviewer Decision Handling

- Treat reviewer `needs_more_context` as an internal control signal only.
- If the runner cannot execute the requested follow-up tool work, return a
  grounded insufficient-context message. Do not send the reviewer instruction to
  Slack as the answer.
- Trace whether a reviewer request was executed, skipped, or converted to
  insufficient context.

### Result Prioritization

- Prefer likely content files over fixture indexes, README files, runbooks, and
  memory docs for `ask` flows.
- When search results include both a search-hint file and a content file, read
  the content file first.
- For subjective passage requests, prefer literature, prose, poetry, quote, or
  fixture content paths over project planning docs.

### UAT Discipline

- Before live Slack UAT, check that exactly one Local Agent process is running.
- Start the Local Agent after code changes so Slack uses the current checkout.
- Use `folders list` to confirm the actual effective readable folders before
  choosing test queries.
- Use both Slack-visible replies and `logs/agent-traces/YYYY-MM-DD.jsonl` as
  evidence.

## Acceptance Criteria

Automated tests:

- A subjective short-passage follow-up can search, read a candidate content
  file, pass review, and return a selected passage with a source name.
- A short-passage flow that finds candidates at the final search turn may still
  perform one bounded `local_file_read` before final review.
- Reviewer `needs_more_context` is never returned directly to Slack.
- If reviewer-requested extra context cannot be executed, the answer is a clear
  insufficient-context message.
- Search/read planning reads `q3-rollout.md` or `week-27.json` before
  `/Users/romazrau/dev/doc-test/README.md` for the Priya TODO question.
- Search/read planning prefers `station-rain.txt` or
  `the-copper-umbrella.md` over docs/memory files for a quiet short-passage
  request.
- Existing deterministic `find <query>` behavior remains unchanged.

Live Slack UAT:

- Process check shows exactly one Local Agent `npm run dev` / `tsx src/index.ts`
  path before test messages are sent.
- `folders list` shows `/Users/romazrau/dev/doc-test` in effective scope.
- `從我本地找到一個適合當作今天心情的短文` returns one clarification question.
- `安靜` returns a selected quiet passage from `station-rain.txt` or
  `the-copper-umbrella.md`, with source path or filename, and does not return
  raw match lists or ask for another generic source/style clarification.
- `ask In local files, what TODO mentions owner Priya?` returns the actual TODO
  from `q3-rollout.md` or `week-27.json`, not reviewer instructions.
- `find copper umbrella`, `find TODO owner Priya`, and
  `find Polar Dawn station` still return deterministic local file matches.
- `logs/agent-traces/YYYY-MM-DD.jsonl` records effective question, concrete tool
  calls, read results, reviewer decision, and final-answer reason for each
  `ask`/conversation UAT case.

## Validation Commands

Focused automated validation:

```sh
npm test -- tests/agentCommands.test.ts
npm run typecheck
```

Full verification:

```sh
npm run verify
```

Live UAT checklist:

```sh
ps -axo pid,ppid,command | rg "(tsx src/index.ts|npm run dev)"
npm run dev
```

Then test from Slack App DM with Chrome and inspect:

```sh
tail -n 120 logs/agent-traces/YYYY-MM-DD.jsonl
tail -n 25 logs/audit.jsonl
```

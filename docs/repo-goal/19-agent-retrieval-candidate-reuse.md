# Agent Retrieval Candidate Reuse

## Goal

Make repeated Slack retrieval requests stable when a prior turn already found a
candidate file, especially Google Drive files whose titles are more searchable
than a broad topic query.

## Context

Live log comparison on 2026-06-30 showed that the article request about AI
transformation and developer impact could fail with broad topic searches, while
the same target was later found by the explicit Drive title
`置身钉内_老鐵備份`.

The unstable behavior had two causes:

- Stale retrieval clarification context could be folded into a later effective
  question and pollute retry queries.
- Google Drive candidate titles and document IDs found in earlier turns were
  not carried forward as structured retrieval hints.

## Acceptance Criteria

- A stale clarification question is not reused unless it is the latest
  assistant turn.
- Zero-result retry queries do not include `User clarified...` control text.
- App DM conversation memory stores only bounded retrieval metadata, not file
  or email content.
- Recent Google Drive candidates can seed follow-up searches when broad topic
  queries return zero results.
- A generic follow-up such as `這個檔案裡面在說什麼？` asks the user to choose
  when multiple recent Drive candidates exist.
- Trace and event logs show when candidate memory was loaded and when it seeded
  a retry.

## Implementation Result

Implemented on 2026-06-30.

- `conversation_turns.tool_call_summary` now stores a compact JSON summary for
  new App DM turns, including tool-call count and safe retrieval candidate
  metadata.
- Conversation context now includes an application-generated recent-candidate
  summary for the planner.
- Typed retrieval loads recent candidate memory, can ask the user to choose
  among multiple Drive candidates, and can seed bounded Drive title searches
  before execution or after zero-result retrieval.
- Trace/event logs now include `retrieval_candidate_memory_loaded` and
  `candidate_seeded_retry`.
- Tool-result summaries include Drive/Gmail metadata so trace logs no longer
  collapse relevant search hits into empty objects.
- Fallback text distinguishes local matches from zero-result Gmail/Drive
  searches when local results may be unrelated.

## Validation

Automated validation passed:

```sh
npm test -- tests/agentCommands.test.ts tests/agentPlan.test.ts tests/localMemory.test.ts
npm run typecheck
```

# Agent Retrieval Candidate Reuse

## Decision

Persist recent retrieval candidates as compact metadata in conversation memory
and reuse them as bounded search hints in later typed retrieval turns.

## Rationale

The 2026-06-30 logs showed that broad topic queries such as `AI 變革 開發人員
影響` did not reliably find the target Drive file, while an explicit title query
for `置身钉内_老鐵備份` did. The agent needed a structured way to remember that
candidate across turns without storing file content or trusting assistant text
as instructions.

## Implementation Result

Implemented on 2026-06-30:

- New App DM turns write JSON `toolCallSummary` data with safe retrieval
  metadata: source type, title, locator, originating tool, and tool-call count.
- Legacy `tool calls=N` summaries remain readable because candidate parsing
  simply ignores non-JSON values.
- Recent candidates are injected into conversation context as a summary marked
  as untrusted retrieval hints.
- Typed retrieval can seed Google Drive title searches from recent candidates
  when a follow-up mentions the title, asks about `這個檔案` / `裡面`, or broad
  searches return zero results.
- Generic follow-ups with multiple recent Drive candidates ask the user to
  choose instead of guessing.
- Stale retrieval clarification follow-ups are ignored unless the last
  assistant turn was the clarification question.
- Zero-result retry sanitizes effective questions before relaxing them, so
  `User clarified...` labels do not become search text.

## Validation

Validation passed with focused agent command, plan, and local memory tests plus
typecheck under Node.js `v22.23.1`.

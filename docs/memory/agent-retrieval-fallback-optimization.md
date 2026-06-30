# Agent Retrieval Fallback Optimization

## Decision

Retrieval fallback optimization is split into two goals:

1. Improve the current configured-context retrieval path without adding public
   web search.
2. Decide whether public web search belongs in Slack Beaver and make that
   capability boundary explicit.

## Rationale

The 2026-06-30 Slack debugging session showed that the generic insufficient
context answer can be technically correct but operationally unhelpful. In the
observed flow, the agent searched local files, Google Drive, and Gmail, received
zero results from all configured sources, and returned the fallback. The user
could not tell whether this meant no configured-source match, no public web
search capability, or a broken multi-turn conversation.

The first implementation target stayed inside the existing trust boundary:
multi-turn clarification state, planner query hygiene, zero-result retry, and
clearer searched-source fallback text. Public web search was later marked out
of scope for the Local Agent.

## Implementation Result

Implemented on 2026-06-30:

- Multi-turn clarification follow-up now keeps the original retrieval request
  and appends all short clarification answers.
- `OR`-joined planner search variants are split before execution, and planner
  instructions now prohibit boolean-style joined query strings.
- Typed retrieval performs one deterministic relaxed-query retry when all
  initial configured-source searches return zero results.
- Reviewer supplemental reads can use relaxed retry hits, so a retry result can
  be read for grounded answer drafting when the reviewer asks for more context.
- Zero-result fallback text now names searched configured sources and result
  counts.
- Public web wording receives an explicit capability-boundary answer instead of
  falling through to local-context insufficient context.

Second Goal implemented on 2026-06-30:

- Public web/Google web search is intentionally not enabled.
- Public web requests ask whether to search configured local/Workspace sources
  instead.
- App Home and README document the boundary.
- Public web detection was narrowed so ordinary topic wording such as
  `網頁設計` still reaches the configured-source planner.

Validated with focused agent plan and command tests plus typecheck.

## Next Work

- Run live Slack UAT for the original article-search flow and inspect
  `logs/agent-events` / `logs/agent-traces` for effective question and retry
  behavior.

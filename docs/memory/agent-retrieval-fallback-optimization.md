# Agent Retrieval Fallback Optimization

## Decision

Retrieval fallback optimization is split into two goals:

1. Improve the current configured-context retrieval path without adding public
   web search.
2. Separately decide whether public web search belongs in Slack Beaver and make
   that capability boundary explicit either way.

## Rationale

The 2026-06-30 Slack debugging session showed that the generic insufficient
context answer can be technically correct but operationally unhelpful. In the
observed flow, the agent searched local files, Google Drive, and Gmail, received
zero results from all configured sources, and returned the fallback. The user
could not tell whether this meant no configured-source match, no public web
search capability, or a broken multi-turn conversation.

The first implementation target stayed inside the existing trust boundary:
multi-turn clarification state, planner query hygiene, zero-result retry, and
clearer searched-source fallback text. Public web search remains a separate
product and safety boundary decision.

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

Validated with focused agent plan and command tests plus typecheck.

## Next Work

- Decide whether public web search is supported or explicitly out of scope.
- Run live Slack UAT for the original article-search flow and inspect
  `logs/agent-events` / `logs/agent-traces` for effective question and retry
  behavior.

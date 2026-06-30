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

The first implementation target should stay inside the existing trust boundary:
multi-turn clarification state, planner query hygiene, zero-result retry, and
clearer searched-source fallback text. Public web search is a separate product
and safety boundary decision.

## Next Work

- Add a pending retrieval request state so multiple short clarification answers
  remain attached to the original request.
- Prevent `OR`-joined query strings from reaching Google Drive and Gmail search.
- Add deterministic relaxed-query retry before final zero-result fallback.
- Update Slack-visible fallback wording to name searched configured sources.
- Decide later whether public web search is supported or explicitly out of
  scope.

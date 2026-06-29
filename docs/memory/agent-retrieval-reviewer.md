# Agent Retrieval Planning And Reviewer

## Context

The current agent can search and read local files, Gmail messages, and Google
Docs through guarded read-only Tool Registry tools. This works well for clear
questions but is weaker for subjective or underspecified retrieval requests.

An observed Slack conversation showed the issue: a broad request for a suitable
short passage was answered with raw local-search matches, including
`docs/repo-goal/00-poc.md`. The file matched broad terms, but it was not a good
answer to the user's intent. The failure came from three interacting behaviors:

- `local_search` uses deterministic substring matching rather than semantic
  ranking.
- Broad natural-language requests can cause the model to choose broad search
  terms.
- The runner can fall back to raw bounded search results when the model does not
  complete a useful search/read/answer flow.

## Decision

Plan a retrieval planning and reviewer phase for `ask <question>` and natural
App DM conversation.

Selected behavior:

- Subjective or underspecified requests should ask one focused clarifying
  question before searching.
- Clear requests should let the agent analyze intent, derive multiple query
  variants, search available sources, read bounded candidate content when
  needed, and draft an answer.
- A separate reviewer agent should inspect the draft and retrieved context
  before the answer is sent to Slack.
- The reviewer may accept the answer, request more context, ask the user a
  clarifying question, or reject the result as insufficiently grounded.
- The reviewer applies to all available read-only search/read sources: local
  files, Gmail, and Google Docs.
- `find <query>` remains deterministic search-only and is not routed through
  retrieval planning or reviewer behavior.
- Search should remain global across allowlisted/configured sources, but later
  implementation should rank or filter results so repo planning documents do
  not dominate content-example requests.

## Tradeoffs

Asking first for subjective requests slows some interactions, but avoids
guessing user preferences and returning technically matched but unhelpful
documents.

Using a separate reviewer model call increases latency and token use, but it
keeps quality-control responsibilities separate from the main conversation
agent. That separation is useful when the reviewer needs to push the main agent
to search again or ask the user for more detail.

Keeping `find <query>` unchanged preserves the project's deterministic search
surface and avoids surprising users who expect direct search results.

## Implementation Notes For Next Work

- Add a reviewer model purpose and structured reviewer decision type.
- Keep reviewer decisions internal to the Local Agent process.
- Do not let the reviewer call tools directly; it should ask the runner to
  perform more search/read work when needed.
- Add prompt instructions that clearly distinguish ambiguity handling, query
  planning, source reading, draft answering, and reviewing.
- Prevent raw local-search fallback from becoming the final answer for
  subjective content-selection requests.
- Add regression coverage for vague short-passage requests that previously
  matched `00-poc.md`.

## Validation Expectation

Logic changes must include tests for:

- Ambiguous subjective request asks one clarifying question before tool use.
- Clear request searches, reads, and receives reviewer acceptance.
- Reviewer can request more context without repeated identical tool loops.
- Reviewer can reject irrelevant search matches instead of returning raw output.
- `find <query>` remains deterministic search-only.

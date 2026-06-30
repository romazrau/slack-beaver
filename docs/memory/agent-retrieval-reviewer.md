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

Implement a retrieval planning and reviewer phase for `ask <question>` and
natural App DM conversation.

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

## Implementation Result

The runner now has a `reviewer` model purpose for answers that used read-only
tool context. The reviewer receives gathered bounded tool outputs and the draft
answer, has no tools, and returns a structured JSON decision:

- `accept`: send the draft answer.
- `needs_more_context`: continue the main agent loop with reviewer feedback and
  allow one additional main-loop window for follow-up search/read work.
- `ask_user`: return one clarifying question.
- `reject_insufficient_context`: return an insufficient-context answer instead
  of raw search matches.

The main instructions now tell the agent to classify retrieval intent, ask first
for subjective or underspecified selections, derive multiple useful query
variants for clear requests, and cite used sources.

A deterministic guard catches vague mood-based short-passage requests before
model/tool use and asks what mood or theme should be used. This specifically
prevents the previous raw `00-poc.md` fallback for that class of request.

The guard now covers the observed Chinese flow:

- User asks for a local short passage that fits today's mood.
- Agent asks which mood or theme to use.
- User replies with a short answer such as `安靜`.
- The runner combines that answer with the prior passage request before calling
  the model, rather than treating `安靜` as a standalone search query.

Subjective content-selection requests also bypass raw local-search fallback. If
the runner hits repeated-tool or max-turn fallback, it now asks for more source
or style guidance instead of listing raw matches such as `00-poc.md`.

Agent loop trace logs are written to ignored `logs/agent-traces/YYYY-MM-DD.jsonl`
files. These logs record the effective question, concrete tool-call inputs,
bounded search result summaries, fallback reasons, and reviewer decisions. Full
read bodies are not written to trace logs.

`find <query>` remains deterministic search-only and does not use the reviewer.

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

## Validation

Automated validation now covers:

- Ambiguous subjective request asks one clarifying question before tool use.
- Chinese short-passage clarification follow-up is carried into the original
  request.
- Clear request searches, reads, and receives reviewer acceptance.
- Reviewer can request more context without repeated identical tool loops.
- Reviewer can reject irrelevant search matches instead of returning raw output.
- Trace logs record concrete tool-call inputs and fallback reasons.
- `find <query>` remains deterministic search-only.

Validated with:

```sh
npm test -- tests/agentCommands.test.ts
npm run typecheck
```

Live Slack/OpenAI UAT remains useful for prompt quality, especially subjective
selection follow-ups after the first clarification.

## Live Slack UAT Follow-up

Chrome-based Slack UAT after the trace-log change produced clearer evidence.

Confirmed:

- The local trace log records `clarification_follow_up` for the Chinese
  short-passage flow.
- The fallback guard prevents the previous raw `00-poc.md` match list from
  being returned for `安靜`.
- Deterministic `find` works against the live external fixture folder:
  `copper umbrella`, `TODO owner Priya`, and `Polar Dawn station` all returned
  local matches.

Remaining gaps:

- The quiet short-passage flow found `station-rain.txt` and
  `the-copper-umbrella.md`, but hit the tool-turn limit before reading and
  selecting a passage.
- The Priya TODO `ask` flow let reviewer `needs_more_context` guidance surface
  to Slack instead of forcing another read or returning insufficient context.
- Search/read ordering still reads search-hint files before the real task files
  in some agent flows.

The follow-up hardening plan and UAT acceptance criteria are recorded in
`docs/repo-goal/16-agent-retrieval-uat-hardening.md`.

## Supplemental Typed Reads

Follow-up debugging on 2026-06-30 found a typed TODO query where `local_search`
returned relevant snippets, but the planner selected no `local_file_read` steps.
The reviewer correctly returned `needs_more_context`, but the typed workflow
converted that decision directly into an insufficient-context Slack reply.

The typed workflow now performs one bounded supplemental read pass when the
reviewer asks for more context. Supplemental reads are derived only from
already-returned search results and use the matching read tool for each source,
with an explicit reviewer fallback cap of three reads that is independent from
planner-declared `readPolicy.maxReads`. After those reads, the agent rebuilds
the evidence ledger, drafts again, and sends the new draft through the reviewer
once more. If the reviewer still cannot accept the answer, the workflow keeps
the existing insufficient-context fallback.

This keeps the reviewer from inventing new paths or arbitrary tool work while
allowing common snippet-only plans, such as TODO searches, to deepen into
grounded file reads.

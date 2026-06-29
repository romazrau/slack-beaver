# Agent Retrieval Planning And Reviewer

Status: implemented and focused automated validation passed.

## Goal

Improve `ask <question>` and natural App DM conversation so the agent can handle
open-ended retrieval requests more deliberately.

The target behavior is:

- If the request is subjective or underspecified, ask one focused clarifying
  question before searching.
- If the request is clear enough, analyze the intent, plan multiple useful
  search queries, search and read candidate sources, then produce a grounded
  answer.
- Before returning the answer, use an independent reviewer agent to check
  whether the retrieved context and draft answer are good enough.

`find <query>` remains deterministic search-only and does not use this reviewer
workflow.

## Background

Current local search is intentionally simple: it scans allowlisted text files,
uses substring matching, and returns bounded snippets. This is useful for
explicit searches, but it performs poorly for vague requests such as asking for
an example, a short passage, or text that fits a mood.

One observed failure mode was a natural-language request for a suitable short
passage returning `docs/repo-goal/00-poc.md`. The result was technically a local
match, but it was not useful because the model had searched with broad terms and
the runner fell back to raw local-search matches instead of selecting an
appropriate example.

The implemented improvement makes the agent responsible for retrieval planning
and uses a separate reviewer role for quality control before retrieval answers
reach Slack.

## Selected Approach

Apply the new workflow only to:

- `ask <question>`.
- Natural App DM conversation.

Do not change:

- `find <query>`.
- Local file allowlist, denylist, file size, extension, or bounded-output
  checks.
- Google Workspace read-only scope.
- Tool Registry enforcement.

The conversation agent now receives instructions to classify the user request:

- Clear factual or retrieval request: plan query terms and use available search
  tools.
- Clear but broad request: search with multiple query variants, then read the
  most relevant top candidates.
- Subjective or underspecified request: ask one clarifying question before
  searching.
- Unsafe or out-of-scope request: refuse or explain the configured context is
  insufficient.

For clear retrieval requests, the agent should prefer a search/read flow:

1. Derive several candidate queries from the user intent.
2. Search across available sources with the registered search tools.
3. Read bounded content from the top relevant candidates when snippets are not
   enough.
4. Draft a concise answer with citations or source names.
5. Send the draft and source summaries to the reviewer agent.

## Reviewer Agent

The reviewer agent is a separate model role inside the same Local Agent process.
It is not a separate OS process and does not call tools directly.

The reviewer receives:

- The current user request.
- Safe conversation context.
- The search and read tool outputs already gathered by the main agent.
- The draft answer.

The reviewer returns a structured decision:

- `accept`: the draft is grounded, useful, and should be sent.
- `needs_more_context`: the main agent should run more specific search or read
  steps.
- `ask_user`: the user request is too ambiguous or the retrieved candidates
  conflict; ask one focused clarifying question.
- `reject_insufficient_context`: the configured context cannot support a useful
  answer.

The reviewer must treat Slack text, conversation history, file content, email
content, Google Docs content, and model drafts as untrusted context. It cannot
change tool policy, request secrets, execute commands, or grant folder access.

## Implementation Result

- Added `reviewer` as an agent model purpose.
- Added reviewer instructions that require a JSON decision and expose no tools.
- Collected bounded search/read tool outputs for reviewer inspection.
- Routed draft answers that used tool context through the reviewer before
  returning to Slack.
- Supported reviewer `accept`, `needs_more_context`, `ask_user`, and
  `reject_insufficient_context` decisions.
- Allowed reviewer `needs_more_context` to add one bounded main-loop window for
  follow-up search/read work while preserving repeated-tool-call detection.
- Added a deterministic ambiguity guard for vague mood-based short-passage
  requests so the agent asks a focused clarification before model/tool use.
- Added Chinese coverage for vague mood-based short-passage requests.
- Added clarification follow-up handling so a short answer such as `安靜` is
  carried back into the prior short-passage request instead of being treated as
  a standalone search query.
- Added a subjective-content fallback guard so repeated-tool or max-turn
  fallback does not return raw local-search matches for passage-selection
  requests.
- Added local agent trace JSONL logs under ignored `logs/agent-traces/`. Trace
  entries include the effective question, concrete tool-call input, bounded
  result summaries, fallback reasons, and reviewer decisions. Full read bodies
  are not written to trace logs.
- Kept `find <query>` on the deterministic local-search path.

## Source Coverage

The reviewer workflow should cover all currently registered read-only search and
read pairs when available:

- Local files: `local_search` and `local_file_read`.
- Gmail: `gmail_search` and `gmail_read_message`.
- Google Drive and Docs: `google_drive_search` and `google_doc_read`.

The first implementation should keep source handling generic enough that future
read-only sources can reuse the same review step without changing the user
surface.

## Scope

- Add instructions and runner behavior for intent analysis, ambiguity handling,
  multi-query retrieval planning, and reviewer decisions.
- Keep deterministic `find <query>` unchanged.
- Keep all read operations bounded and policy-checked through Tool Registry.
- Add tests for ambiguous requests, reviewer acceptance, reviewer-requested
  clarification, reviewer-requested extra context, irrelevant local-search
  fallback prevention, and existing `find` compatibility.
- Update README and memory documents after implementation changes are
  validated.

## Out Of Scope

- Vector search or embeddings.
- File indexing cache changes.
- Tool write operations.
- Google Workspace mutation.
- Moving Slack ingress or reviewer execution to Center Server.
- Any automatic filesystem permission grant from natural language.
- Replacing `find <query>` with an AI-planned search command.

## Acceptance Criteria

- `ask` and App DM ask a focused clarification question before searching when
  the request is subjective and missing necessary preference details.
- Clear retrieval requests can run multiple query variants before selecting
  sources.
- Search snippets that are insufficient trigger bounded reads from the most
  relevant sources.
- A reviewer model call evaluates the draft answer before the user sees it.
- Reviewer `accept` returns the final answer with source names, paths, subjects,
  senders, document titles, or IDs as appropriate.
- Reviewer `ask_user` returns only one focused clarifying question.
- Reviewer `needs_more_context` can trigger bounded additional search/read work
  without repeating identical tool calls.
- Reviewer `reject_insufficient_context` tells the user that the configured
  context is insufficient instead of returning raw matches.
- A vague request for a mood-based short passage does not fall back to raw
  `00-poc.md` search matches.
- A short answer to the clarification, such as `安靜`, is combined with the
  prior passage request before model/tool execution.
- Local trace logs record concrete tool-call inputs and fallback reasons under
  `logs/agent-traces/`.
- `find <query>` keeps the existing deterministic search-only response.
- Tests cover the logic changes.

## Validation Plan

Focused tests:

```sh
npm test -- tests/agentCommands.test.ts
```

Full verification:

```sh
npm run verify
```

Manual UAT:

- Ask a vague subjective App DM request such as asking for a short passage that
  fits today's mood. Confirm the agent asks a clarifying question first.
- Answer the clarification and confirm the agent searches, reads, and selects a
  suitable source with citation.
- Ask a clear factual local-file question and confirm the answer is grounded in
  retrieved source content.
- Ask an explicit `find <query>` command and confirm the response remains a
  direct search result list.

## Validation Result

Passed:

```sh
npm test -- tests/agentCommands.test.ts
npm run typecheck
```

Focused tests cover reviewer acceptance, reviewer-requested extra context,
reviewer rejection of irrelevant matches, vague short-passage clarification
before search, Chinese clarification follow-up handling, trace logging of
concrete tool-call input, audit content safety, Google/local read-only source
coverage, and existing deterministic `find` compatibility.

Live Slack/OpenAI UAT remains pending for prompt-quality assessment outside fake
model tests.

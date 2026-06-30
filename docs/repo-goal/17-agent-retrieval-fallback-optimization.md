# Agent Retrieval Fallback Optimization

## Goal

Reduce the frequency and ambiguity of the Slack-visible answer:

```text
I could not produce a grounded answer from the configured local context.
```

The optimization is split into two goals:

1. Improve reliability inside the current configured-context boundary.
2. Decide and implement the next capability boundary for requests that ask for
   public web results.

## Context

Live Slack debugging on 2026-06-30 found a high-frequency fallback case in the
App DM conversation flow:

- The user asked for an article about AI transformation and its impact on
  developers.
- The agent asked clarifying questions.
- The final short reply, `都可以`, was treated as the effective question instead
  of being fully chained back to the original article request.
- The planner inferred the older topic from conversation context and searched
  local files, Google Drive, and Gmail.
- All three searches returned zero results.
- The typed workflow returned the generic insufficient-context fallback.

The run was traceable through `logs/agent-events/2026-06-30.jsonl` and
`logs/agent-traces/2026-06-30.jsonl` with trace id
`f6186c90-2502-4641-b8af-989420cf7aaf`.

## Root Causes

- Multi-turn clarification chaining only preserves the immediate prior
  clarification. A second short preference answer can become the whole
  effective question.
- Planner-generated search queries can include `OR`-style combined variants.
  Google Drive search treats that as one literal query string, not as separate
  boolean clauses.
- Zero-result plans stop too quickly. When every configured source returns zero
  results, the user receives the generic fallback without a more specific
  reason.
- The product wording does not clearly distinguish configured local/Workspace
  context from public web search.

## First Goal: Current-Context Reliability

Improve the existing local files, Google Drive, and Gmail retrieval path without
adding public web search.

### Scope

- Preserve the original retrieval request across multiple clarification turns.
- Store short user preferences as structured retrieval constraints, such as
  source preference, language preference, and acceptable breadth.
- Keep the effective question grounded in the original request plus all
  clarification answers.
- Instruct and validate the planner to emit short independent query variants,
  not `OR`-joined query strings.
- Add a deterministic zero-result retry pass that relaxes or rewrites queries
  before returning insufficient context.
- Replace the generic fallback with a reasoned fallback that names searched
  configured sources and their result counts.

### Acceptance Criteria

- In an article-search flow, `任一篇` and a later `都可以` are both carried into
  the original article request instead of replacing it.
- The typed planner never sends `OR`-joined query strings to
  `google_drive_search` or `gmail_search`.
- When all initial searches return zero results, the executor performs one
  bounded retry with shorter or broader query variants before final fallback.
- If both search passes return zero results, the Slack answer says which
  configured sources were searched and that no matching local/Workspace result
  was found.
- If the user asks for public Google or web results, the answer clearly states
  that the current agent can only search configured local files, Google Drive,
  and Gmail.
- Existing grounded-answer safeguards remain unchanged: the agent must not
  invent an article when configured sources have no evidence.

### Validation

Automated tests:

```sh
npm test -- tests/agentCommands.test.ts tests/agentPlan.test.ts
npm run typecheck
```

Live Slack UAT:

- Ask for an article about AI transformation and developer impact.
- Answer source and language clarification with short replies such as `任一篇`
  and `都可以`.
- Confirm traces show the original article request plus both clarification
  preferences in the effective retrieval task.
- Confirm zero-result answers name the configured sources instead of returning
  only the generic fallback.

## Second Goal: Capability Boundary Expansion

Decide how Slack Beaver should handle requests that ask for public web results,
for example `google 上?` or `找任一篇公開文章`.

### Scope

- Decide whether public web search belongs in the Local Agent.
- If public web search is in scope, add a read-only web search tool with clear
  provenance and citation requirements.
- If public web search is out of scope, make the limitation explicit in prompts,
  docs, Slack replies, and App Home guidance.
- Keep local files, Gmail, Google Drive, and public web evidence separate in
  traces and user-facing citations.

### Acceptance Criteria

- A request for public web results no longer falls through to a local-context
  insufficient answer without explanation.
- If web search is enabled, public web results are cited separately from local
  and Google Workspace sources.
- If web search is not enabled, the agent asks whether to search configured
  local/Workspace sources instead.
- The README and setup docs describe the selected boundary and any required
  configuration.

### Validation

Automated tests should cover the selected behavior:

- Web-search-disabled behavior for public-web wording.
- Web-search-enabled search/read/citation behavior, if implemented.
- Regression coverage that local-context answers still require local or
  Workspace evidence.

Live Slack UAT should include:

- `google 上找 AI 變革對開發人員的影響`
- `找任一篇公開文章，關於 AI 對 software developers 的影響`
- A configured-source-only article request to verify the existing path remains
  intact.

## Implementation Notes

- Prefer the first goal before any web-search expansion. It reduces fallback
  frequency without changing the trust boundary.
- Keep fallback text factual and short. The agent should explain what it
  searched, not expose internal planner details by default.
- Preserve full traceability in `logs/agent-events` and `logs/agent-traces` so
  screenshots can be correlated with exact planner and tool decisions.

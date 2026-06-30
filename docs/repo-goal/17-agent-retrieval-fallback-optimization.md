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

## Second Goal: Capability Boundary Decision

Decision: public web search is not enabled for Slack Beaver Local Agent.
Requests that ask for public web results, for example `google 上?` or
`找任一篇公開文章`, should receive an explicit boundary answer and an option to
search configured local/Workspace sources instead.

### Scope

- Do not add a public web search tool.
- Make the limitation explicit in prompts, docs, Slack replies, and App Home
  guidance.
- Keep evidence limited to configured local files, Gmail, and Google Drive.
- Avoid classifying ordinary topics such as `網頁設計` as public web search
  requests unless the user asks for public web, Google web, or public articles.

### Acceptance Criteria

- A request for public web results no longer falls through to a local-context
  insufficient answer without explanation.
- The agent asks whether to search configured local/Workspace sources instead.
- Ordinary local/Workspace retrieval wording that happens to include a web-topic
  term is still routed through the normal configured-source path.
- The README and App Home describe the selected boundary.

### Validation

Automated tests cover the selected behavior:

- Web-search-disabled behavior for public-web wording.
- Regression coverage that ordinary web-topic wording still reaches the planner
  instead of the public-web boundary.
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
- Broader stop, continue, choose, and act decisions are planned in
  `docs/repo-goal/18-agent-workflow-state-machine.md` as a shared workflow
  state machine rather than a search-only state machine.

## Implementation Result

First Goal implemented on 2026-06-30.

Implemented behavior:

- Multi-turn retrieval clarification follow-ups now search backward to the
  original retrieval request and attach all short clarification answers, so a
  later answer such as `都可以` does not replace the original article-search
  intent.
- Planner search validation splits `OR`-joined or pipe-joined query variants
  into independent search steps before deterministic execution.
- Planner search capping now preserves source diversity across local files,
  Gmail, and Google Drive instead of keeping only the first emitted variants.
- Planner instructions now explicitly require each search query to be one short
  standalone variant and prohibit boolean-style joined query strings.
- Typed retrieval now performs one deterministic relaxed-query retry when all
  initial configured-source searches return zero results.
- Retry tool-call IDs are isolated from the original zero-result searches, and
  reviewer supplemental reads can target the retry plan when the retry found
  candidate sources.
- If retry still produces zero results, the Slack-visible answer names the
  configured sources searched and their result counts instead of returning only
  the generic insufficient-context fallback.
- If the reviewer still needs more context after a bounded supplemental read,
  Slack receives a partial-context summary that names the configured evidence
  found instead of a generic fallback.
- Reviewer `needs_more_context` messages now influence supplemental read source
  priority, so requests to read Google Drive/PDF candidates do not spend the
  bounded read budget on earlier local matches first.
- Stop summaries now explain why the agent stopped, what configured context was
  found, and what the user can provide next. Chinese retrieval requests receive
  this guidance in Chinese.
- Public web wording such as `google 上` is handled as an explicit current
  capability boundary: the agent explains that public web/Google search is not
  enabled and offers configured local/Workspace sources instead.

Validated with:

```sh
npm test -- tests/agentPlan.test.ts tests/agentCommands.test.ts
npm run typecheck
```

Second Goal implemented on 2026-06-30.

Selected boundary:

- Public web/Google web search remains out of scope for Slack Beaver Local
  Agent.
- No public web search tool was added.
- Public web requests receive a direct boundary reply and ask whether to search
  configured local/Workspace sources instead.
- App Home and README now document that AI answers can search configured local
  files, Google Drive, and Gmail, but not public web/Google search.
- Public web intent detection was narrowed so ordinary topic wording such as
  `網頁設計` does not bypass the configured-source planner.

Additional validation:

```sh
npm test -- tests/agentCommands.test.ts tests/appHomeView.test.ts
npm run typecheck
```

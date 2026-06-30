# Memory Index

This directory records project decisions, implementation notes, progress, and next work for Slack Forge.

## Entries

- `00-now-and-next.md`: Current project state, validation status, and active next phase.
- `agent-conversation-context-and-tools.md`: Implemented App DM natural conversation, agent-readable tool catalog, and 8-turn context summarization policy.
- `agent-retrieval-reviewer.md`: Implemented retrieval planning and independent reviewer agent behavior for `ask` and App DM quality control, plus bounded typed supplemental reads when reviewer context is insufficient.
- `agent-token-onboarding.md`: Improved README, Slack App Home, and chat guidance for local-only AI agent token setup.
- `accelerated-local-file-search.md`: Decision to prioritize a local Slack bot file search slice and require a user-run Local Agent process under tighter time constraints.
- `central-server-todo-planning.md`: Planned Local Server, Center Server, and Center Server DB split with central TODO management as the first shared capability.
- `doc-test-fixtures.md`: Synthetic local-search fixture corpus for poetry, literature, markets, news-style briefs, conversations, and task lists.
- `dynamic-readable-scope-and-runtime-notices.md`: Selected design for Slack-native folder scope expansion and proactive Local Agent online/offline notices.
- `future-hybrid-routing.md`: Future Central Server routing decision for multiple Local Agents while keeping the current POC single-active-agent.
- `google-workspace-oauth.md`: Local Google OAuth onboarding, restart-time connection guidance, read-only Gmail/Drive/Docs Tool Registry tools, Drive metadata-aware file reads, bounded request-error diagnostics, Drive search normalization/retry behavior, and token/audit safety decisions.
- `local-memory-and-ai-agent.md`: Implemented SQLite local memory, OpenAI-only provider decision, local CLI token setup, token refusal, and agent tool safety rules.
- `local-agent-runtime-status.md`: Local Agent runtime heartbeat, Slack App Home online/stale status, fixed unavailable-agent guidance, and current Slack ingress boundary.
- `node-runtime-and-native-sqlite.md`: Node.js 22 runtime standardization and `better-sqlite3` native ABI rebuild guidance.
- `openai-agent-runner.md`: Guarded OpenAI-backed `ask <question>` runner, strict local-search tool calling, token-file loading, and fake-client tests.
- `openai-model-selection.md`: Local CLI model discovery and switching, `gpt-5.5` default, and the `List models: Read` key permission decision.
- `project-structure-cleanup.md`: Source layout cleanup by responsibility and the standard `npm run verify` gate.
- `quick-uat-start-guide.md`: Quick manual UAT startup guide covering first startup, resume startup, and reset-state startup.
- `readme-documentation-scope.md`: Decision to keep README limited to server startup, current features, and docs links while moving setup details into `docs/setup/`.
- `reproducible-demo-planning.md`: Dedicated repeatable POC demo folder for Slack local-agent, Center task dispatch, multi-agent comparison, fixture expectations, and evidence capture.
- `remote-task-dispatch-planning.md`: Planned next hybrid POC for Center Server-owned agent tasks, Local Agent worker execution, registration, heartbeat, and claim leases.
- `repo-initialization.md`: Initial repository documentation and ignore-rule decisions.
- `search-read-summarize-planning.md`: Implemented local and Google search/read/summarize workflow, including local and Google Drive PDF reads plus minimum token access by provider.
- `slack-openai-uat.md`: Live Slack/OpenAI UAT results, repeated tool-call finding, deterministic runner fallback, Socket Mode startup disconnect guard, and fixture-scope note.
- `slack-app-setup-and-uat.md`: Real Slack app setup, secret handling, local daemon operation, runtime fix, and live UAT results for Slack Local File Search v0.
- `slack-app-home-chat.md`: Decision and implementation notes for Slack-native App Home and Messages tab chat.
- `slack-markdown-rendering.md`: Programmatic Markdown-to-Slack `mrkdwn` rendering for agent replies, including supported subset and fallback behavior.
- `typed-agent-workflow-and-local-observability.md`: POC decision to keep Chat Orchestrator, Planner, deterministic Executor, and Reviewer in one Local Agent process while adding structured local event logs and retrieval UAT hardening for bounded final reads, confirmation-gated continuation state, `tool_call_error` traces, content-file prioritization, and reviewer feedback containment.
- `v0-facts-hardening-results.md`: Results from executing the v0 facts and hardening phase, including fixture UAT, coverage gaps, daemon finding, and Phase 5 deferral.

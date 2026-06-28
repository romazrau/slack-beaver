# Memory Index

This directory records project decisions, implementation notes, progress, and next work for Slack Forge.

## Entries

- `00-now-and-next.md`: Current project state, validation status, and active next phase.
- `accelerated-local-file-search.md`: Decision to prioritize a local Slack bot file search slice and require a user-run Local Agent process under tighter time constraints.
- `doc-test-fixtures.md`: Synthetic local-search fixture corpus for poetry, literature, markets, news-style briefs, conversations, and task lists.
- `local-memory-and-ai-agent.md`: Implemented SQLite local memory, OpenAI-only provider decision, local CLI token setup, token refusal, and agent tool safety rules.
- `openai-agent-runner.md`: Guarded OpenAI-backed `ask <question>` runner, strict local-search tool calling, token-file loading, and fake-client tests.
- `project-structure-cleanup.md`: Source layout cleanup by responsibility and the standard `npm run verify` gate.
- `readme-documentation-scope.md`: Decision to keep README limited to server startup, current features, and docs links while moving setup details into `docs/setup/`.
- `repo-initialization.md`: Initial repository documentation and ignore-rule decisions.
- `slack-app-setup-and-uat.md`: Real Slack app setup, secret handling, local daemon operation, runtime fix, and live UAT results for Slack Local File Search v0.
- `slack-app-home-chat.md`: Decision and implementation notes for Slack-native App Home and Messages tab chat.
- `v0-facts-hardening-results.md`: Results from executing the v0 facts and hardening phase, including fixture UAT, coverage gaps, daemon finding, and Phase 5 deferral.

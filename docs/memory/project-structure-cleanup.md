# Project Structure Cleanup

## Context

The source files had grown as a flat `src/*.ts` list while the product direction
was expanding from local file search into local memory, Slack-native chat, and a
future OpenAI-backed agent runner.

Flat files were still manageable for v0, but future work would make ownership
harder to see because Slack UI code, local setup CLI code, memory storage, search,
and agent command orchestration all lived at the same level.

## Decision

Group source files by responsibility without changing runtime behavior:

- `src/agent/`: command execution and tool registry.
- `src/cli/`: local setup and maintenance CLI entry point.
- `src/config/`: environment configuration loading and validation.
- `src/memory/`: SQLite local memory store.
- `src/observability/`: audit logging.
- `src/search/`: guarded read-only local file search.
- `src/setup/`: local folder and secret setup validation.
- `src/slack/`: Slack Bolt app wiring, App Home view, onboarding copy, and Slack response formatting.

Add `npm run verify` as the standard local gate for future changes:

```sh
npm run typecheck && npm test && npm run build
```

## Validation

- `npm run typecheck` passed after the import-path migration.
- Full `npm run verify` should be used before committing future changes.

## Next Considerations

- Keep tests behavior-focused and import the domain module they exercise directly.
- Add new OpenAI agent runner code under `src/agent/` unless it becomes large
  enough to warrant a narrower subfolder.
- Keep Slack-specific text and Block Kit rendering under `src/slack/` so core
  agent behavior can remain UI-independent.

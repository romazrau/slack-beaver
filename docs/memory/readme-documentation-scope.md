# README Documentation Scope

## Date

2026-06-28

## Context

`README.md` had grown into a mixed entry point containing product planning, architecture notes, Slack app setup, local runtime setup, UAT history, feature status, and directory navigation.

That made it harder for a new contributor to quickly answer the first question: how to start the Local Agent server and what the project currently does.

## Decision

Keep `README.md` focused on:

- Starting the Local Agent server.
- Running the main verification gate.
- Listing currently implemented features.
- Linking to deeper documentation.

Move setup and operational details into `docs/setup/slack-api-and-local-runtime.md`, including:

- Slack app settings.
- Required scopes and events.
- Local `.env` shape.
- Secret handling rules.
- Folder and OpenAI token CLI commands.
- Optional `launchctl submit` demo notes.

Planning, phase scope, acceptance criteria, implementation decisions, UAT history, and next work stay under `docs/repo-goal/`, `docs/runbooks/`, and `docs/memory/`.

## Result

The README is now a short project entry point instead of the source of truth for all project history. Detailed setup remains traceable from the README through the docs index.

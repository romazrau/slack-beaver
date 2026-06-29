# Central Server TODO Planning

## Context

The project is moving from a single Local Agent POC toward a hybrid architecture.
The current Local Agent already owns Slack Socket Mode, local files, local
credentials, OpenAI, Google OAuth, local memory, and guarded tools.

The next requested capability is a Central Server and Local Server split. The
Central Server only needs to manage TODOs for now. TODOs must record who created
them and the primary owner.

## Decision

Introduce three project boundaries in the repository:

- `local-server`: current Slack Beaver Local Agent.
- `center-server`: new central HTTP runtime for shared coordination features.
- `center-server-db`: central TODO persistence module.

Keep `center-server-db` as a module and documentation area for the first slice.
Do not split it into a separately deployed service yet.

Keep Slack ingress in the Local Agent for now. Central Server should not hold
Slack tokens or route events until TODO management is implemented and validated.

## TODO Scope

The first Central Server TODO model should include:

- Required creator: `createdBy`.
- Required primary owner: `primaryOwner`.
- Required title.
- Optional description.
- Status values: `open`, `in_progress`, `done`, `canceled`.
- Creation and update timestamps.

The first interface should be a JSON HTTP API plus local CLI smoke commands.
Slack TODO commands can be added after the API and repository are stable.

## Tradeoffs

SQLite keeps the next slice local, fast, and consistent with the current
`better-sqlite3` dependency. It also avoids introducing PostgreSQL operations
before the TODO contract is proven.

Keeping Local Agent code in place avoids destabilizing the already validated
Slack/OpenAI/Google path. The project boundary should be documented first, then
implemented in new `src/center-server` and `src/center-db` modules.

## Validation Plan

- Repository tests for migration, create, list, get, update, validation, and
  immutable creator fields.
- API tests for health, create/list/get/update, malformed input, and missing
  task ids.
- Full `npm run verify` after implementation.
- Documentation update in README, project READMEs, repo-goal, memory index, and
  now/next.

## Deferred

- Central Slack ingress.
- Multi-agent registration and routing.
- Task dispatch to Local Agents.
- Central audit policy.
- Dashboard or rich Slack TODO UI.

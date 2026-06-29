# Central Server TODO Management

## Goal

Implement the first Central Server slice without moving the existing Local Agent runtime.

This phase introduces three project boundaries inside the repository:

- `local-server`: the existing Slack Local Agent.
- `center-server`: a new HTTP runtime for shared coordination features.
- `center-server-db`: the central SQLite repository layer used by `center-server`.

The first Central Server capability is TODO management only. TODO records must
track who created the item and the primary owner.

## Architecture Decision

Keep the current Local Agent as the owner of local files, local credentials,
OpenAI calls, Google OAuth tokens, and Slack Socket Mode for the current POC.

Added Central Server as a separate runtime that owns shared TODO state. Central
Server should not take Slack bot/app tokens yet, should not route events to Local
Agents yet, and should not execute local tools.

Keep Center Server DB as a separate module and README, but do not require a
separate deployable database service in this phase. SQLite remains the default
implementation so the vertical slice can be tested locally.

## Minimal TODO Model

The first schema should support:

- `id`: generated task id.
- `title`: required short task title.
- `description`: optional longer notes.
- `status`: `open`, `in_progress`, `done`, or `canceled`.
- `createdBy`: required creator identifier.
- `primaryOwner`: required owner identifier.
- `createdAt`: creation timestamp.
- `updatedAt`: last update timestamp.

`createdBy` and `createdAt` are immutable after creation. `primaryOwner`,
`title`, `description`, and `status` can be updated through validated APIs.

## Server Interface

The Central Server exposes a small JSON HTTP API:

- `GET /health`: returns server status.
- `GET /tasks`: lists TODOs, newest updated first.
- `GET /tasks/:id`: returns one TODO or `404`.
- `POST /tasks`: creates a TODO.
- `PATCH /tasks/:id`: updates mutable TODO fields.

Validation rules:

- `title`, `createdBy`, and `primaryOwner` are required on create.
- Empty or whitespace-only strings are rejected.
- `status` must be one of the allowed status values.
- Unknown task ids return `404`.
- Malformed input returns `400` with a concise error.

## Project Layout

Implemented documentation and code boundaries:

- `projects/local-server/README.md`: existing Local Agent responsibilities and
  commands.
- `projects/center-server/README.md`: Central Server API, env, and run commands.
- `projects/center-server-db/README.md`: schema, repository contract, and SQLite
  storage notes.
- `src/center-server/`: HTTP app, request handler, config, and server entrypoint.
- `src/center-db/`: TODO repository and migration logic.
- `src/cli/centerCli.ts`: local smoke commands for TODO create/list/update.

Implemented npm scripts:

```sh
npm run center:dev
npm run center:tasks:list
npm run center:tasks:create -- --title "Follow up" --created-by U123 --owner U456
npm run center:tasks:update -- --id 1 --status done
```

## Acceptance Criteria

- Central Server can start locally without Slack tokens. Implemented.
- `GET /health` succeeds. Implemented.
- A TODO can be created with `title`, `createdBy`, and `primaryOwner`. Implemented.
- Created TODOs can be listed and fetched by id. Implemented.
- A TODO can be marked `in_progress`, `done`, or `canceled`. Implemented.
- Invalid create/update payloads are rejected. Implemented.
- Repository tests cover migration, create, list, get, and update behavior. Implemented.
- API handler tests cover happy paths plus validation and `404` cases. Implemented.
- README and memory docs describe the three project boundaries. Implemented.

## Validation

- `npm run typecheck` passed.
- `npm test -- tests/centerTaskRepository.test.ts tests/centerServer.test.ts` passed.
- `npm run verify` passed with 18 test files and 90 tests.
- Local running server UAT passed for `GET /health`, `POST /tasks`,
  `PATCH /tasks/:id`, and `GET /tasks` against `http://127.0.0.1:4318`.
- Chrome/Computer Use UAT reached Chrome and showed that this Chrome profile
  blocks `localhost` and `127.0.0.1` navigation with `ERR_BLOCKED_BY_CLIENT`.
  The server itself was verified through local HTTP requests while Chrome
  blocker handling remains a browser-environment follow-up.

## Deferred

- Moving Slack ingress from Local Agent to Central Server.
- Local Agent registration, heartbeat, leases, and routing.
- Slack UI or App Home TODO management.
- Multi-user auth, RBAC, and organization policy.
- PostgreSQL or a separately deployed database service.
- Web dashboard.
- Chrome profile blocker resolution for direct localhost page UAT.

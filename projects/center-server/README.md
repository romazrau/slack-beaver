# Center Server

Center Server is the central HTTP runtime for shared coordination features.

## Capabilities

The first implemented capability is TODO management. The second implemented
slice is remote agent task dispatch for Local Agent workers.

TODOs must track:

- `title`
- `description`
- `status`
- `createdBy`
- `primaryOwner`
- `createdAt`
- `updatedAt`

## API

```text
GET /health
GET /tasks
GET /tasks/:id
POST /tasks
PATCH /tasks/:id
POST /agents/register
POST /agents/:agentId/heartbeat
GET /agent-tasks
GET /agent-tasks/:id
POST /agent-tasks
POST /agent-tasks/claim
PATCH /agent-tasks/:id
```

`POST /tasks` requires `title`, `createdBy`, and `primaryOwner`.

`PATCH /tasks/:id` can update `title`, `description`, `status`, and
`primaryOwner`. `createdBy` and `createdAt` stay immutable.

`POST /agents/register` records a Local Agent owner and capabilities.
`POST /agent-tasks` currently supports `answer_question` tasks. `POST
/agent-tasks/claim` assigns one eligible task to a registered Local Agent and
sets a claim lease so two workers cannot run the same task at the same time.

## Commands

```sh
npm run center:dev
npm run center:tasks:list
npm run center:tasks:create -- --title "Follow up" --created-by U123 --owner U456
npm run center:tasks:update -- --id 1 --status done
npm run center:agents:register -- --agent-id local-1 --owner U123
npm run center:agent-tasks:create -- --question "What changed?" --created-by U123 --owner U123
npm run center:agent-tasks:list
npm run center:agent-tasks:claim -- --agent-id local-1
```

## Configuration

```env
CENTER_SERVER_HOST=127.0.0.1
CENTER_SERVER_PORT=4318
CENTER_DB_PATH=./data/slack-beaver-center.sqlite
```

## Boundary

Center Server should not own Slack bot/app tokens in the first TODO slice. Slack
ingress remains in Local Server until multi-agent routing is explicitly built.
Local Agents still own local files, local memory, OpenAI API keys, Google OAuth
tokens, and actual guarded tool execution.

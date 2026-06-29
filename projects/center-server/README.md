# Center Server

Center Server is the central HTTP runtime for shared coordination features.

## First Capability

The first implemented capability is TODO management.

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
```

`POST /tasks` requires `title`, `createdBy`, and `primaryOwner`.

`PATCH /tasks/:id` can update `title`, `description`, `status`, and
`primaryOwner`. `createdBy` and `createdAt` stay immutable.

## Commands

```sh
npm run center:dev
npm run center:tasks:list
npm run center:tasks:create -- --title "Follow up" --created-by U123 --owner U456
npm run center:tasks:update -- --id 1 --status done
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

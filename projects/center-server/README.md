# Center Server

Center Server is the planned central HTTP runtime for shared coordination
features.

## First Capability

The first capability is TODO management.

TODOs must track:

- `title`
- `description`
- `status`
- `createdBy`
- `primaryOwner`
- `createdAt`
- `updatedAt`

## Planned API

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

## Planned Commands

```sh
npm run center:dev
npm run center:tasks:list
npm run center:tasks:create -- --title "Follow up" --created-by U123 --owner U456
npm run center:tasks:update -- --id 1 --status done
```

## Boundary

Center Server should not own Slack bot/app tokens in the first TODO slice. Slack
ingress remains in Local Server until multi-agent routing is explicitly built.

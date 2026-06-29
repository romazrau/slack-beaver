# Center Server DB

Center Server DB is the planned persistence module for central TODO state.

## First Storage Backend

Use SQLite through the existing `better-sqlite3` dependency.

Default path after implementation:

```env
CENTER_DB_PATH=./data/slack-beaver-center.sqlite
```

## Planned Schema

```text
tasks
- id integer primary key autoincrement
- title text not null
- description text
- status text not null
- created_by text not null
- primary_owner text not null
- created_at text not null
- updated_at text not null
```

Allowed status values:

- `open`
- `in_progress`
- `done`
- `canceled`

## Repository Contract

The first repository should support:

- migrate schema
- create task
- list tasks
- get task by id
- update mutable fields

The repository should validate input before writing. `createdBy` and `createdAt`
are immutable after creation.

## Boundary

This project is a module boundary first, not a separate deployed database service
yet. PostgreSQL or a standalone DB service can be evaluated after the TODO API is
validated.

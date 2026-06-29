# Center Server DB

Center Server DB is the persistence module for central TODO state and remote
agent task dispatch state.

## Storage Backend

Use SQLite through the existing `better-sqlite3` dependency.

Default path after implementation:

```env
CENTER_DB_PATH=./data/slack-beaver-center.sqlite
```

## Schema

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

registered_agents
- agent_id text primary key
- owner_slack_user_id text not null
- display_name text
- capabilities_json text not null
- status text not null
- last_seen_at text not null
- created_at text not null
- updated_at text not null

agent_tasks
- id integer primary key autoincrement
- type text not null
- status text not null
- created_by text not null
- target_owner text
- input_json text not null
- result_summary text
- error_summary text
- claimed_by_agent_id text
- claim_expires_at text
- attempt_count integer not null
- created_at text not null
- updated_at text not null
```

Allowed status values:

- `open`
- `in_progress`
- `done`
- `canceled`

## Repository Contract

The repository supports:

- migrate schema
- create task
- list tasks
- get task by id
- update mutable fields
- register Local Agent
- record Local Agent heartbeat
- create agent task
- claim eligible agent task with a lease
- complete, fail, or cancel an agent task

The repository should validate input before writing. `createdBy` and `createdAt`
are immutable after creation.

Remote agent task rows store bounded input, result summaries, and error
summaries only. They must not store local file bodies, email bodies, Google Docs
bodies, OpenAI tokens, Google tokens, or Slack tokens.

## Boundary

This project is a module boundary first, not a separate deployed database service
yet. PostgreSQL or a standalone DB service can be evaluated after the TODO API is
validated.

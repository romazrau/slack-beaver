# Center Task Dispatch Demo

## Purpose

Show that Center Server can manage durable agent tasks while Local Agent workers
execute bounded work from their own machine.

This demo can run without moving Slack ingress to Center Server.

## Preconditions

- Node.js 22 is active.
- Dependencies are installed.
- The Local Agent has local folder and OpenAI token setup when real answers are
  required.
- A temporary Center Server SQLite DB path is selected for the demo.
- A unique `CENTER_AGENT_ID` is selected for the worker.

## Terminal A: Start Center Server

Use a temporary DB so the run starts from known task state:

```sh
CENTER_DB_PATH=/tmp/slack-beaver-demo-center.sqlite CENTER_SERVER_PORT=4319 npm run center:dev
```

Expected:

- Center Server starts on `http://127.0.0.1:4319`.
- Existing tasks in that temporary DB are either absent or intentionally reused.

## Terminal B: Register And Create A Task

Register an agent identity:

```sh
CENTER_DB_PATH=/tmp/slack-beaver-demo-center.sqlite npm run center:agents:register -- --agent-id demo-agent-1 --owner U_DEMO_OWNER
```

Create a queued task:

```sh
CENTER_DB_PATH=/tmp/slack-beaver-demo-center.sqlite npm run center:agent-tasks:create -- --question "What does the deployment checklist say about rollback ownership?" --created-by U_DEMO_REQUESTER --owner U_DEMO_OWNER
```

List tasks:

```sh
CENTER_DB_PATH=/tmp/slack-beaver-demo-center.sqlite npm run center:agent-tasks:list
```

Expected:

- The task is visible.
- The task starts as `queued`.
- The task has bounded JSON input.

## Terminal C: Run One Worker Pass

```sh
CENTER_SERVER_URL=http://127.0.0.1:4319 CENTER_AGENT_ID=demo-agent-1 CENTER_AGENT_OWNER_SLACK_USER_ID=U_DEMO_OWNER CENTER_AGENT_DISPLAY_NAME="Demo Agent 1" npm run agent:worker -- once
```

Expected:

- The worker registers or refreshes itself.
- The worker sends heartbeat.
- The worker claims one eligible task.
- The worker completes or fails the task with bounded summary text.

List tasks again:

```sh
CENTER_DB_PATH=/tmp/slack-beaver-demo-center.sqlite npm run center:agent-tasks:list
```

Expected:

- The task status is `completed` or `failed`.
- Completed tasks include bounded `resultSummary`.
- Failed tasks include bounded `errorSummary`.

## Evidence To Capture

Record in [evidence-template.md](evidence-template.md):

- Center Server URL.
- Center DB path.
- Agent id.
- Owner id used for routing.
- Task id.
- Initial and final task status.
- Attempt count.
- Result or error summary shape.
- Whether the task was bounded and did not store source bodies.

## Pass Criteria

- A task can be created centrally.
- A registered Local Agent worker can claim the task.
- The task transitions through `queued` to `running` to terminal state.
- Center Server stores only bounded summaries and metadata.
- Local credentials and full local source bodies remain outside Center Server.

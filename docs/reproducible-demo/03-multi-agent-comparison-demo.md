# Multi-Agent Comparison Demo

## Purpose

Show the path toward different computers running the same task with comparable
outputs.

This is a comparison demo, not a guarantee that model wording will be identical.
Compare structured evidence, source summaries, and lifecycle state.

## Demo Model

Run two agent identities against equivalent fixture data:

- `demo-agent-a`
- `demo-agent-b`

They may run on the same computer for the first reproducible POC. Later, run
the same steps on two separate computers pointed at the same Center Server.

## Preconditions

- Both agents have equivalent fixture corpus content.
- Both agents use the same selected model when possible.
- Both agents have the same allowed folder setup.
- Both agents advertise `answer_question` capability.
- Center Server uses a clean temporary DB for the comparison run.

## Setup

Start Center Server:

```sh
CENTER_DB_PATH=/tmp/slack-beaver-multi-agent-demo.sqlite CENTER_SERVER_PORT=4319 npm run center:dev
```

Register two agents with the same owner:

```sh
CENTER_DB_PATH=/tmp/slack-beaver-multi-agent-demo.sqlite npm run center:agents:register -- --agent-id demo-agent-a --owner U_DEMO_OWNER
CENTER_DB_PATH=/tmp/slack-beaver-multi-agent-demo.sqlite npm run center:agents:register -- --agent-id demo-agent-b --owner U_DEMO_OWNER
```

Create two equivalent tasks:

```sh
CENTER_DB_PATH=/tmp/slack-beaver-multi-agent-demo.sqlite npm run center:agent-tasks:create -- --question "What does the deployment checklist say about rollback ownership?" --created-by U_DEMO_REQUESTER --owner U_DEMO_OWNER
CENTER_DB_PATH=/tmp/slack-beaver-multi-agent-demo.sqlite npm run center:agent-tasks:create -- --question "What does the deployment checklist say about rollback ownership?" --created-by U_DEMO_REQUESTER --owner U_DEMO_OWNER
```

## Run Workers

Run the first worker:

```sh
CENTER_SERVER_URL=http://127.0.0.1:4319 CENTER_AGENT_ID=demo-agent-a CENTER_AGENT_OWNER_SLACK_USER_ID=U_DEMO_OWNER CENTER_AGENT_DISPLAY_NAME="Demo Agent A" npm run agent:worker -- once
```

Run the second worker:

```sh
CENTER_SERVER_URL=http://127.0.0.1:4319 CENTER_AGENT_ID=demo-agent-b CENTER_AGENT_OWNER_SLACK_USER_ID=U_DEMO_OWNER CENTER_AGENT_DISPLAY_NAME="Demo Agent B" npm run agent:worker -- once
```

List tasks:

```sh
CENTER_DB_PATH=/tmp/slack-beaver-multi-agent-demo.sqlite npm run center:agent-tasks:list
```

## Compare

Compare:

- Task status.
- Claimed agent id.
- Attempt count.
- Tool call count in result summary when present.
- Source file names or source summaries when present.
- Whether output was truncated.
- Whether either task failed and why.

Do not require exact natural-language answer equality. The report should say
"comparable output" when the answers cite the same source family and preserve
the same operational conclusion.

## Lease Behavior Check

To show that two agents do not claim the same task, create one task and start
two worker passes close together. Expected result:

- Only one worker claims the task before the lease expires.
- The other worker reports no claimable task or claims a different queued task.
- Completed, failed, and canceled tasks are not reclaimed.

## Pass Criteria

- Two agent identities can register.
- Each agent can claim eligible work for the same owner.
- One task is not claimed by two agents at the same time.
- Equivalent tasks produce comparable structured evidence.
- Center Server remains the task coordinator, not the holder of private source
  bodies or local credential files.

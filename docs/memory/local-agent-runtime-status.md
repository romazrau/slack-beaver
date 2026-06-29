# Local Agent Runtime Status

## Context

The Slack app currently receives Socket Mode events inside the Local Agent process.
That process is the Slack ingress, local file reader, local credential holder, and
Slack reply sender for App DM conversations.

Users need a clearer signal that the Local Agent is actually running, and a
consistent unavailable-agent message for cases where a future always-on ingress
detects that the configured Local Agent is offline.

## Decision

Record a lightweight local runtime heartbeat in SQLite under
`runtime_heartbeats`. The Local Agent records the heartbeat on startup and when
Slack App Home is opened.

Slack App Home now shows `Local Agent runtime` as online, stale, or not seen yet.
The not-seen and stale states use the same fixed offline guidance formatter that
future Slack ingress code can reuse:

```text
Slack Beaver Local Agent is not reachable from this Slack conversation.
Start the Local Agent on the configured computer with `npm run dev`, then try again.
```

## Boundary

This does not make the existing Local Agent reply while it is fully stopped.
With the current architecture, a stopped Local Agent means no Socket Mode
receiver is connected for this repo. Fully automatic Slack fallback replies while
the Local Agent is down require moving Slack ingress to an always-on Center
Server or another small always-on Slack receiver.

## Validation

Automated tests cover heartbeat persistence, App Home online/stale/not-seen
status formatting, and the fixed offline response text.

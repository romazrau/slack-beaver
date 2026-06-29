# Local Agent Runtime Status

## Goal

Make the current Local Agent runtime state visible from Slack App Home, and define
a shared fixed unavailable-agent response that future Slack ingress code can
reuse.

## Scope

- Record a local runtime heartbeat when the Local Agent starts.
- Refresh the heartbeat when Slack App Home is opened.
- Show runtime status in Slack App Home without exposing secrets or local paths.
- Centralize the fixed unavailable-agent Slack response text.
- Document the current architecture boundary: if the Local Agent process is fully
  stopped, this repo does not receive Slack Socket Mode events.

## Out Of Scope

- Moving Slack ingress from the Local Agent to Center Server.
- Adding a daemon or LaunchAgent installer.
- Adding a polling loop for remote agent status.

## Acceptance Criteria

- App Home shows a Local Agent runtime field.
- Missing heartbeat is shown as not seen yet.
- Recent heartbeat is shown as online.
- Old heartbeat is shown as stale.
- The fixed unavailable-agent response is generated from a single Slack response
  formatter.
- Tests cover heartbeat persistence, App Home status formatting, and the fixed
  response.

## Validation

- `npm test -- tests/localMemory.test.ts tests/appHomeView.test.ts tests/slackResponses.test.ts`
- `npm run typecheck`

# Future Hybrid Routing

## Context

The current POC uses Slack Socket Mode directly from the Local Agent. This keeps the first version small and validates the local-first workflow, but it is only safe as a single-owner / single-active-agent model.

Multiple Local Agents using the same Slack app credentials at the same time are not supported in the current POC. They can race on Slack events, produce duplicate replies, overwrite App Home state, or answer a user's request from the wrong machine's local files, memory, or paid AI token.

## Decision

Central Server and multi-agent routing remain future work and should not be implemented in the current POC.

When the project moves toward multiple users or multiple computers, Slack token ownership should move to Central Server. Central Server should become the only Slack ingress and the only holder of Slack bot/app tokens. Local Agents should become user-owned workers that connect back to Central Server.

## Future Architecture Notes

Central Server should own:

- Slack event ingress.
- Slack bot/app credentials.
- User-to-agent routing.
- Agent registration and heartbeat state.
- Active-agent lease per Slack user.
- Task dispatch and task claim leases.
- Notification delivery.
- Central audit and policy.
- Slack retry and event deduplication.

Local Agents should own:

- Local file access.
- Local tool execution.
- Local credential files, including the AI agent token.
- Local memory and cache that should stay on the user's computer.
- Capability reporting to Central Server.

## POC Boundary

For the current POC, the documented operating assumption is:

- One Slack app credential set maps to one active Local Agent process.
- The Local Agent may directly connect to Slack Socket Mode.
- Multi-user shared state, multi-machine routing, and Central Server task dispatch are deferred.

This preserves the future Hybrid path without adding Central Server implementation work now.

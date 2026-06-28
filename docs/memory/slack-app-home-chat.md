# Slack App Home Chat

## Date

2026-06-28

## Decision

The next independent chat interface is Slack-native App Home and Messages tab, not a separate desktop app.

Users should be able to open `Slack Beaver Local Agent` from Slack's left sidebar under Applications, then type `find <query>` in the app Messages tab.

## Rationale

- It matches the user's screenshot and expected Slack app usage.
- It keeps Slack as the control surface.
- It avoids desktop packaging and OS installer complexity.
- It preserves the original runtime decision: the Local Agent still runs on the user's computer and performs local file reads.

## Implementation Notes

- Slash command `/agent find <query>` remains supported.
- App Home publishes a private Home tab with safe status details.
- App Messages tab listens for direct `message.im` events.
- Direct app messages support the same `find <query>` syntax.
- Bot/self messages and non-DM messages are ignored to avoid loops.
- Search and audit behavior are shared between slash commands and app messages.
- Audit log entries now include optional `source`:
  - `slash_command`
  - `app_home_message`

## Slack App Settings Required

- App Home enabled.
- Messages tab enabled.
- Event Subscriptions enabled.
- Bot events:
  - `app_home_opened`
  - `message.im`
- Bot scopes:
  - `commands`
  - `chat:write`
  - `im:history`

After changing scopes or event subscriptions, reinstall the app to the `For Coding` workspace.

## Validation Needed

- Open `Slack Beaver Local Agent` from Slack's Applications section.
- Confirm Home tab renders status and command guidance without secrets or local paths.
- In Messages tab, send `find Socket`.
- Confirm Slack replies with local file results.
- Confirm audit log records `source=app_home_message`.
- Confirm `/agent find Socket` still works and records `source=slash_command`.

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
- Home tab enabled.
- Messages tab enabled.
- Messages tab allows users to send slash commands and messages.
- Event Subscriptions enabled.
- Socket Mode enabled; no Event Subscriptions Request URL is required for this local agent.
- Bot events:
  - `app_home_opened`
  - `message.im`
- Bot scopes:
  - `commands`
  - `chat:write`
  - `im:history`

After changing scopes or event subscriptions, reinstall the app to the `For Coding` workspace.

## Actual Configuration

Verified on 2026-06-28 in the `For Coding` workspace:

- App Home Home tab is enabled.
- App Home Messages tab is enabled.
- Messages tab user input is enabled.
- Event Subscriptions are enabled.
- Bot events include `app_home_opened` and `message.im`.
- Bot scopes include `commands`, `chat:write`, and `im:history`.
- App icon uses `assets/slack-beaver-local-agent-avatar.png`.
- The app was reinstalled after scope and event changes.
- Actual token values remain only in local `.env` and were not documented.

## Validation Result

Verified on 2026-06-28:

- Opened `Slack Beaver Local Agent` from Slack's Applications section.
- Confirmed the Home tab renders status and command guidance without secrets or local paths.
- Sent `find Socket` in the Messages tab.
- Confirmed Slack replied with local file results in the app chat.
- Sent `list tasks` in the Messages tab.
- Confirmed Slack replied with `Unsupported command. Usage: find <query>`.
- Sent a no-result query in the Messages tab.
- Confirmed Slack replied with a clear no-result response.
- Confirmed audit log records App Home searches with `source=app_home_message`.
- Confirmed Slack app chat and sidebar render the updated app icon.

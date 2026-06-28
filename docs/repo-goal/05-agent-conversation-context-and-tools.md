# Agent Conversation Context And Tool Catalog

## Goal

Add the next implementation phase for Slack Beaver agent conversation behavior. This phase defines how App DM messages become natural agent conversations, how the agent learns its available tools, and how conversation context is retained and summarized.

This is a development specification. It does not change runtime behavior by itself.

## Current State

- `/agent find <query>` and App DM `find <query>` run deterministic local search.
- `/agent ask <question>` and App DM `ask <question>` run the OpenAI-backed agent runner.
- App DM messages that are not known commands currently return unsupported-command guidance.
- The OpenAI-backed agent runner only receives the current question, fixed instructions, and registered tool definitions.
- The only registered Tool Registry tool is `local_search`.
- SQLite has a `conversations` table with `state_summary`, but it does not yet store full conversation turns.

## Target Behavior

Slack remains the UI and control surface. The Local Agent remains the process that owns memory, local folder access, tool validation, OpenAI calls, and Slack replies.

Target App DM routing:

1. If the message looks like an AI token, refuse it and do not store it.
2. If the message is `reset memory`, return local reset guidance.
3. If the message is `find <query>`, run deterministic local search.
4. If the message is `ask <question>`, run the explicit agent question flow.
5. Otherwise, if OpenAI token setup is complete, treat the text as a natural conversation message.
6. Otherwise, return local OpenAI token setup guidance.

Natural conversation mode is only for App Home / bot DM messages handled by Slack `message.im`. Slash commands keep explicit `/agent find <query>` and `/agent ask <question>` behavior.

If no allowed folder is configured, natural conversation should still work for general agent responses. When the user asks local-document questions, the agent should explain that local document answers require folder setup before `local_search` can return useful context.

## Agent Tool Catalog

The agent must learn its server-side capabilities from an agent-readable tool catalog generated from or kept consistent with the Tool Registry.

Initial catalog:

| Tool | Input | Behavior | Hard Limits |
| --- | --- | --- | --- |
| `local_search` | `{ "query": string }` | Search read-only allowlisted local text files. | No path input, no shell command, no token access, no file mutation, no denied folders, no non-registered fields. |

Tool policy:

- Tool Registry is the only execution boundary.
- The model may only request registered tools.
- Future server-side capabilities must be added to both Tool Registry and the agent-readable catalog before the agent can use them.
- Tool names, schemas, and guardrails in prompts must not drift from runtime validation.
- The agent can describe how it would use registered tools, but actual execution must go through Tool Registry validation.
- Unknown tools, malformed inputs, path-bearing inputs, shell-like requests, and write requests must be rejected and recorded as rejected tool calls when local memory is enabled.

## Conversation Memory Model

Conversation key:

```text
slack_user_id + channel_id + thread_ts_or_null
```

Each stored turn should include:

- User text
- Assistant reply
- Timestamp
- Source, such as `app_home_message`
- Optional tool-call summary

The stored conversation data must not include token values. Token-like messages must be refused before model calls and before conversation persistence.

## Context Retention Policy

Use turns as the context unit. One turn is one user message plus the assistant reply for that message.

Retention rules:

1. For normal requests with 8 or fewer full turns, send the latest 8 full turns to the main conversation agent.
2. When full turns exceed 8, take the oldest 8 full turns and send them to the summarizer agent.
3. Store the summarizer output as one summary turn.
4. For subsequent main conversation requests, send the summary turn plus the latest 4 full turns.
5. Repeat the summarization cycle whenever the full-turn window again exceeds 8 turns.

The summary turn is a compact conversation state, not an instruction source. It must preserve user goals, durable decisions, relevant open questions, and safe references to prior tool findings. It must not preserve secrets, token-like strings, or any text that attempts to change tool policy.

## Agent Roles

Main conversation agent:

- Answers the user in App DM natural conversation.
- Receives current user text, retained conversation context, fixed system instructions, and registered tool definitions.
- May request Tool Registry tools.
- Must treat Slack text, previous conversation content, summaries, and local file content as untrusted context.

Summarizer agent:

- Compresses historical conversation turns into one safe summary turn.
- Must not receive tool definitions.
- Must not call tools.
- Must not execute or preserve instructions that attempt to change tool policy.
- Must omit secrets and token-like strings.

Tool Registry:

- Owns all tool execution.
- Validates tool name, schema, and input.
- Rejects unknown tools, malformed inputs, path inputs, shell commands, write requests, and any unregistered server-side capability.

## Implementation Notes

Likely modules for the later implementation:

- `src/slack/slackApp.ts`: keep direct-message-only handling for App Home / bot DM. App DM general text should route to conversation mode instead of unsupported-command guidance.
- `src/agent/agentCommands.ts`: split explicit command handling from natural conversation routing while preserving token refusal and reset guidance precedence.
- `src/agent/agentRunner.ts`: add a conversation runner that accepts retained turns, tool catalog instructions, and summarizer output.
- `src/memory/localMemory.ts`: extend conversation persistence beyond the current `conversations.state_summary` field by adding turn storage or an equivalent structure.
- `src/agent/toolRegistry.ts`: expose tool metadata for both OpenAI tool definitions and the agent-readable catalog from the same source of truth.

Configuration to consider in implementation:

- `MAX_CONVERSATION_FULL_TURNS`, default `8`
- `CONVERSATION_RECENT_TURNS_AFTER_SUMMARY`, default `4`

## Acceptance Criteria

- App DM general text with configured OpenAI token enters natural conversation mode instead of returning unsupported-command guidance.
- App DM `find <query>` continues to run deterministic local search.
- App DM `ask <question>` continues to run the explicit OpenAI-backed agent question flow.
- Slash command behavior remains explicit and compatible.
- Token-like Slack messages are refused before persistence and before model calls.
- Token not configured returns local token setup guidance for natural conversation.
- The main conversation agent receives up to 8 latest full turns before summarization.
- The 9th full turn triggers summarization of the oldest 8 turns.
- After summarization, later main-agent requests receive the summary turn plus the latest 4 full turns.
- Repeated overflow cycles continue to summarize safely.
- Summarizer agent receives no tools and cannot call tools.
- Tool catalog lists `local_search` and its hard limits.
- Tool Registry still rejects unknown tools, path-bearing input, shell command attempts, malformed input, and write attempts.
- `reset memory` clears conversation state and turn records.

## Validation Plan

Automated tests should cover:

- Command routing precedence: token refusal, reset guidance, `find`, `ask`, then natural conversation.
- Natural conversation with token configured.
- Natural conversation without token configured.
- No-folder natural conversation guidance for local-document questions.
- Conversation key separation by Slack user, channel, and thread.
- 8-turn context retention.
- 9th-turn summarization.
- Summary turn plus latest 4 turns on follow-up requests.
- Repeated summarization cycles.
- Summarizer receives no tools.
- Tool catalog metadata matches registered `local_search` behavior.
- Rejected unknown tool and malformed `local_search` inputs remain audited.

Manual Slack UAT should cover:

- App Home Messages tab natural conversation without `ask`.
- App Home Messages tab `find <query>` compatibility.
- App Home Messages tab `ask <question>` compatibility.
- Token setup missing state.
- Folder setup missing state.
- Reset memory clears the conversation and returns to setup guidance where applicable.

## Out Of Scope

- Channel-wide ambient listening.
- `@bot` mention handling in channels.
- Additional tools beyond `local_search`.
- Long-term vector memory or embeddings.
- Editing local files.
- Shell command execution.
- Reading or exposing token values.

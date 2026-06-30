# Slack Markdown Rendering

## Context

Slack-visible AI answers can contain normal Markdown from the model, but Slack renders only its own `mrkdwn` subset. This caused headings such as `## Title` and bold markers such as `**text**` to appear literally in Slack replies.

## Decision

Slack outbound rendering now converts common readable Markdown into Slack-compatible message payloads in code. The agent and runner can keep returning plain strings; the Slack adapter converts those strings into fallback `text` plus Block Kit `section` blocks using `mrkdwn`.

This keeps formatting policy deterministic and testable without relying on prompt instructions or asking the model to remember Slack-specific syntax.

## Supported Subset

- Markdown headings become Slack bold lines.
- `**bold**` and `__bold__` become Slack `*bold*`.
- Inline code and fenced code blocks are preserved, with Slack control characters escaped.
- `---`, `***`, and `___` lines become Slack divider blocks.
- Markdown links with `http`, `https`, or `mailto` URLs become Slack manual links.
- Long sections are split to stay within Slack's 3000-character `mrkdwn` text object limit.
- Generated Block Kit payloads are capped at Slack's 50-block message limit with a final truncation notice.

Unsupported Markdown features such as tables and HTML blocks degrade to escaped readable text.

## Validation

Focused coverage lives in `tests/slackMarkdown.test.ts`, with `tests/slackApp.test.ts` verifying the Slack adapter wraps command output with the renderer before reply dispatch.

# Local Memory And AI Agent

## Date

2026-06-28

## Decision

The next major capability should add local memory and an OpenAI-backed agent, but implementation should wait until the plan and acceptance criteria are documented.

The defaults are:

- Local memory store: SQLite.
- First AI provider: OpenAI.
- AI token setup surface: local CLI only.
- Slack App Home remains the chat UI.
- Local Agent remains the runtime for memory, local file reads, tool execution, and Slack replies.

## Rationale

- SQLite fits the single-user, single-machine POC while leaving a path toward repository interfaces and future central APIs.
- OpenAI-only keeps the first provider implementation and test matrix small.
- Local CLI token entry avoids sending paid secrets through Slack.
- Keeping folder permission decisions in Local Agent code prevents the LLM from expanding its own access.

## Planned Behavior

- If a user opens the app with no known folders, Slack should ask them to add allowed folders locally.
- If known folders exist, requests use those folders by default when no path is mentioned.
- Users can add paths later through a local setup flow.
- Slack should refuse pasted AI tokens and direct users to local CLI setup.
- The agent should route work through a Tool Registry, not arbitrary commands.

## Safety Rules

- Slack messages, local files, and LLM output are untrusted input.
- Token values must not appear in Slack, prompts, audit logs, README examples, or memory docs.
- Local file content must not be treated as instructions.
- The LLM cannot read outside allowlisted folders, bypass denylist checks, run shell commands, or modify files.
- Tool calls require deterministic guards before execution and audit entries after execution.

## Planned Documentation And Validation

- `docs/repo-goal/03-local-memory-and-ai-agent.md` defines the next phase scope and acceptance criteria.
- README should describe the feature as planned, not implemented.
- Future implementation must include tests for folder memory, token refusal, Tool Registry guardrails, and prompt-injection fixtures.

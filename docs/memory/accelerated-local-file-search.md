# Accelerated Local File Search Plan

## Context

The original repo goal describes a three-day Slack-based Local AI Ops Agent POC. Time is now tighter, so the near-term plan has been reduced to the most valuable end-to-end slice: a local Slack bot that can search allowlisted local files.

## Decision

Prioritize local file search before Google Workspace, task tracking, vector search, rich Slack interactions, or advanced AI orchestration.

The key runtime decision is that Slack does not read local OS folders directly. The user must run a Local Agent process on their computer, and that process is both the Slack bot backend and the local file reader for v0.

The accelerated implementation order is:

1. Local Agent runtime decision.
2. Runtime skeleton.
3. Local file guard and search core.
4. Slack command integration.
5. Audit log and demo hardening.

Deferred work remains documented as later phases so the smaller plan does not lose the broader project direction.

## Rationale

- Local file search is the clearest proof that a Slack-controlled Local Agent can provide value.
- It exercises the highest-risk boundary early: Slack access to local resources.
- It can be tested mostly with local fixtures before Slack integration is complete.
- It avoids Google OAuth and task workflow complexity until the core path is working.
- It avoids premature cloud-server and companion-app pairing work while still proving the Slack-to-local-machine control path.

## Validation Approach

- Add behavior-focused tests for config parsing, path guard, extension filtering, file size limits, and search results when implementation begins.
- Use a manual Slack UAT script to verify command acknowledgement, safe result formatting, no-result handling, denied path behavior, oversized file behavior, and audit logging.

## Current Status

- Slack Local File Search v0 skeleton exists.
- Implemented config validation, guarded direct local search, Slack `/agent find <query>` command wiring, JSONL audit logging, and behavior-focused tests.
- Next validation step is installing dependencies, running automated checks, and performing manual Slack UAT with an internal/test Slack app.

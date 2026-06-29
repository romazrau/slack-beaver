# Reproducible Demo Planning

## Context

The project has enough technical POC surface to demonstrate Slack-native local
agent operation and Center Server-owned remote task dispatch, but the reporting
story needed a dedicated repeatable demo plan.

## Decision

Add `docs/reproducible-demo/` as the dedicated folder for repeatable POC demo
planning and evidence capture.

The folder separates:

- Local Slack Agent demonstration.
- Center Server task dispatch demonstration.
- Multi-agent comparable-output demonstration.
- Fixture expectations.
- Evidence capture template.

## Rationale

Existing runbooks focus on startup and focused UAT. The report needs a clearer
story that can be rerun from known inputs and compared across machines or agent
identities.

The demo plan should compare structured evidence and cited sources rather than
exact natural-language model wording.

## Validation

This is a documentation-only planning change. No application logic changed, so
no automated test coverage was added.

Validation should use:

```sh
git diff --check
```

The future implementation follow-up should add structured task result metadata
before stronger multi-agent comparison claims are made.

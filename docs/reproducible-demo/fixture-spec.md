# Fixture Specification

## Purpose

The reproducible demo needs stable fixture data so repeated runs can be compared
without depending on private files.

The fixture corpus should be safe to share in screenshots and reports. It must
not contain secrets, customer data, real personal data, or private production
material.

## Fixture Layout

Use one local folder as the demo fixture root:

```text
demo-fixtures/
  operations/
    deployment-checklist.md
    incident-summary.md
  product/
    roadmap-notes.md
    customer-themes.csv
  research/
    market-brief.json
    meeting-notes.txt
  denied/
    hidden-secret.txt
  oversized/
    too-large.txt
```

Recommended maximum depth is five levels from the fixture root.

## Required Search Needles

Include these exact phrases in non-denied, non-oversized files:

- `moonlit harbor`
- `deployment checklist`
- `Priya TODO`
- `rollback owner`
- `customer themes`

Include these exact phrases only in files that should be denied or skipped:

- `deny-secret-hit`
- `oversized-hit`

## Minimum Content Expectations

`deployment-checklist.md` should include:

- A release date.
- A deployment owner.
- A rollback owner.
- Three verification steps.
- One TODO assigned to Priya.

`incident-summary.md` should include:

- A short incident title.
- A root cause.
- A mitigation.
- One follow-up task.

`customer-themes.csv` should include:

- At least three rows.
- A `theme` column.
- A `priority` column.

`market-brief.json` should include:

- A `summary` field.
- A `risks` array.
- A `nextSteps` array.

## Expected Demo Questions

Use questions that can be answered from the fixture corpus:

```text
find moonlit harbor
ask What does the deployment checklist say about rollback ownership?
ask Summarize the Priya TODO and cite the local source.
ask What customer themes should be prioritized?
```

For Center Server task dispatch, use:

```text
What does the deployment checklist say about rollback ownership?
```

## Fixture Validation Checklist

- The fixture root is allowlisted through `npm run agent:folders:add`.
- Denied fixture folders are configured through `.env` or local config.
- The local search path returns expected matches for allowed needles.
- The local search path does not return denied or oversized hits.
- Demo evidence records file names and bounded snippets only.
- Demo evidence does not include full source bodies.

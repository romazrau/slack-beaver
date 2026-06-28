# doc-test Fixtures

## Decision

Add `doc-test/` as a local-search fixture corpus for Slack Beaver manual
validation.

## Scope

- The corpus uses supported v0 file types: Markdown, TXT, CSV, and JSON.
- Content covers poetry, literary prose, a one-act drama, synthetic equity data,
  fictional world-news-style briefs, fabricated conversations, and fictional
  task lists.
- Directory depth is capped at five levels from `doc-test` so nested traversal
  can be tested without creating an unusually deep tree.
- All market data, news briefs, conversations, and tasks are synthetic test
  data. They should not be treated as factual reporting, operational records,
  or investment guidance.

## Validation Use

Suggested manual queries:

- `find moonlit harbor`
- `find semiconductor revenue`
- `find monsoon vaccine corridor`
- `find Mira deployment checklist`
- `find TODO owner Priya`

To validate against this corpus, set `WATCHED_FOLDERS` to the absolute
`doc-test` path and run the existing Local Agent flow.

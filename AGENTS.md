# Agent Instructions

## Core Principles

- Prefer readable, maintainable, and explicit solutions.
- Avoid clever, implicit, or overly abstract behavior.
- Keep changes scoped to the current task.
- Preserve traceability for planning, decisions, validation, and next steps.

## Mandatory Rules

### Testing

- Logic changes must include test coverage.
- UI changes should include behavior-focused tests when practical.
- If test coverage cannot be added, document the reason and the manual verification performed.


### Documentation

- After each completed and validated feature, update `README.md` before committing if setup, usage, commands, configuration, or behavior changed.
- Keep `README.md` sufficient for a new contributor to install, configure, run, and verify the project.
- Keep feature plans, phases, and acceptance criteria under `docs/repo-goal/`.
- Record important implementation decisions, tradeoffs, and task progress under `docs/memory/`.
- Add or update a topic file in `docs/memory/` for each meaningful feature or decision area.
- Summarize new memory entries in `docs/memory/index.md`.
- Update `docs/memory/00-now-and-next.md` after each completed feature to reflect the current state and likely next work.

## Workflow

1. Review the existing repo state before planning or editing.
2. Define the goal, scope, acceptance criteria, and verification approach before implementation.
3. Implement the smallest maintainable change that satisfies the acceptance criteria.
4. Add or update tests for logic changes.
5. Run relevant verification commands.
6. Update README and memory documents when the change affects setup, usage, decisions, or project status.
7. Before committing, review the diff for unrelated edits and documentation drift.

## Conflict Handling

- If instructions conflict, prioritize Mandatory Rules.
- If Mandatory Rules still conflict or are unclear, ask the user for confirmation before proceeding.
- Do not silently skip required tests or documentation updates.
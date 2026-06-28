# Repository Initialization

## Context

The repository currently contains planning documentation for a Slack-based Local AI Ops Agent POC. No Node.js package manifest, source code, runtime configuration, or test framework exists yet.

## Decisions

- Add a project `.gitignore` before introducing source code so secrets, local runtime data, and generated files are not committed accidentally.
- Keep `.env.example` trackable while ignoring real `.env` files.
- Ignore local SQLite files because the POC will use SQLite for local documents, tasks, task events, tool calls, settings, cache, and audit data.
- Ignore local Google and Slack token artifacts because the POC will rely on Slack tokens and Google OAuth installed-app credentials.
- Write the README in Traditional Chinese to match the current project planning material and collaboration language.
- Do not invent install, run, test, or lint commands before `package.json` exists.

## Validation Approach

- Use `git status --short` to confirm the changed file set.
- Use `git diff --check` to catch whitespace and patch formatting issues.
- Manually review `.gitignore` to confirm it does not ignore source files, lockfiles, README, or docs.
- Manually review `README.md` to confirm a new contributor can understand the POC purpose, current status, expected stack, and next steps.

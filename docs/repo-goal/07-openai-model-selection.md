# OpenAI Model Selection Plan

## Goal

Add local-only OpenAI model discovery and switching so the user can see
Responses text models available to the saved API key and choose the model used
by `ask` and natural App DM conversation.

## Scope

- Add CLI commands for current/list/set model management.
- Store selected model in SQLite local memory settings.
- Use selected model before `OPENAI_MODEL`, then fall back to default
  `gpt-5.5`.
- Require OpenAI key permissions `List models: Read` and `Responses: Write`.

## Acceptance Criteria

- `npm run agent:models:current` shows the active model.
- `npm run agent:models:list` lists visible selectable Responses text models
  and marks the active model.
- `npm run agent:models:set -- <model-id>` rejects unavailable and incompatible
  models, including specialized image, audio, realtime, transcription, and TTS
  models.
- Agent responses use the selected SQLite model when one is configured.
- Resetting local memory clears the selected model without deleting token files.
- Automated tests cover model filtering, CLI behavior, setting persistence,
  reset behavior, and runtime precedence.

## Validation

- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.

# OpenAI Model Selection

## Context

Slack Beaver originally used a fixed `OPENAI_MODEL` default. The Local Agent now
needs a local way to inspect which GPT models the saved OpenAI API key can see
and to switch the active model without editing `.env`.

## Decision

- Default OpenAI model is now `gpt-5.5`.
- Model management stays local-only through CLI commands, not Slack messages.
- OpenAI key minimum permissions are now `List models: Read` and
  `Responses: Write` for the selected model.
- The selected model is stored in SQLite settings under `openai.model`.
- Runtime model precedence is selected SQLite model, then `OPENAI_MODEL`, then
  default `gpt-5.5`.

## Implementation Notes

- `agent:models:list` lists selectable Responses text models visible to the
  saved key.
- `agent:models:set -- <model-id>` only accepts models from that visible
  compatible model list.
- Switching does not send a paid probe response; it relies on OpenAI model list
  visibility plus local filtering that excludes specialized image, audio,
  realtime, transcription, and TTS models.

## Validation

- Automated tests cover model filtering, rejected unavailable/incompatible
  models, CLI current/list/set behavior, SQLite setting storage, reset
  clearing, and model precedence.

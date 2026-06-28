export function formatMissingAiAgentTokenStartupGuidance(): string {
  return [
    "AI agent token is not configured locally.",
    "To enable `ask <question>` and natural App DM answers, keep this server running and run this in another terminal:",
    "  npm run agent:secrets:set-openai",
    "Paste the OpenAI API key only when the local prompt asks for it. Do not paste API keys into Slack."
  ].join("\n");
}

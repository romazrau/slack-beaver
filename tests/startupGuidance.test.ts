import { describe, expect, it } from "vitest";
import { formatMissingAiAgentTokenStartupGuidance } from "../src/setup/startupGuidance.js";

describe("formatMissingAiAgentTokenStartupGuidance", () => {
  it("points users to local token setup without asking for Slack secrets", () => {
    const message = formatMissingAiAgentTokenStartupGuidance();

    expect(message).toContain("AI agent token is not configured locally");
    expect(message).toContain("npm run agent:secrets:set-openai");
    expect(message).toContain("another terminal");
    expect(message).toContain("Do not paste API keys into Slack");
  });
});

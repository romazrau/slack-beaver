import { describe, expect, it } from "vitest";
import { formatSearchResponse, parseAgentCommand } from "../src/slackResponses.js";

describe("parseAgentCommand", () => {
  it("parses find commands", () => {
    expect(parseAgentCommand("find onboarding docs")).toEqual({
      type: "find",
      query: "onboarding docs"
    });
  });

  it("rejects unsupported commands", () => {
    expect(parseAgentCommand("list tasks")).toEqual({
      type: "invalid",
      reason: "Unsupported command. Usage: /agent find <query>"
    });
  });
});

describe("formatSearchResponse", () => {
  it("formats no-result responses", () => {
    expect(formatSearchResponse("missing", [])).toContain("No local files matched");
  });

  it("escapes Slack control characters", () => {
    const response = formatSearchResponse("onboarding", [
      {
        filename: "notes.md",
        path: "/tmp/<unsafe>/notes.md",
        matchType: "content",
        snippet: "A <tag> & text"
      }
    ]);

    expect(response).toContain("&lt;unsafe&gt;");
    expect(response).toContain("&lt;tag&gt; &amp; text");
  });
});

import { describe, expect, it } from "vitest";
import { isDirectUserMessage } from "../src/slackApp.js";

describe("isDirectUserMessage", () => {
  it("accepts direct user messages", () => {
    expect(
      isDirectUserMessage({
        channel_type: "im",
        user: "U123",
        channel: "D123",
        text: "find Socket"
      })
    ).toBe(true);
  });

  it("ignores bot, subtype, and non-DM messages", () => {
    expect(
      isDirectUserMessage({
        channel_type: "im",
        bot_id: "B123",
        user: "U123",
        channel: "D123",
        text: "find Socket"
      })
    ).toBe(false);
    expect(
      isDirectUserMessage({
        channel_type: "im",
        subtype: "bot_message",
        user: "U123",
        channel: "D123",
        text: "find Socket"
      })
    ).toBe(false);
    expect(
      isDirectUserMessage({
        channel_type: "channel",
        user: "U123",
        channel: "C123",
        text: "find Socket"
      })
    ).toBe(false);
  });
});

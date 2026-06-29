import { describe, expect, it } from "vitest";
import { isDirectUserMessage, isMessageBeforeRuntimeStart } from "../src/slack/slackApp.js";

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

describe("isMessageBeforeRuntimeStart", () => {
  it("identifies Slack messages sent before the Local Agent runtime started", () => {
    const runtimeStartedAt = new Date("2026-06-29T14:31:43.000Z");

    expect(
      isMessageBeforeRuntimeStart(
        {
          ts: "1782743280.123456"
        },
        runtimeStartedAt
      )
    ).toBe(true);
  });

  it("allows messages sent at or after Local Agent startup", () => {
    const runtimeStartedAt = new Date("2026-06-29T14:31:43.000Z");

    expect(
      isMessageBeforeRuntimeStart(
        {
          ts: "1782743503.000000"
        },
        runtimeStartedAt
      )
    ).toBe(false);
    expect(
      isMessageBeforeRuntimeStart(
        {
          ts: "1782743503.000001"
        },
        runtimeStartedAt
      )
    ).toBe(false);
  });

  it("does not reject messages with missing or malformed Slack timestamps", () => {
    const runtimeStartedAt = new Date("2026-06-29T14:31:43.000Z");

    expect(isMessageBeforeRuntimeStart({}, runtimeStartedAt)).toBe(false);
    expect(isMessageBeforeRuntimeStart({ ts: "not-a-slack-ts" }, runtimeStartedAt)).toBe(false);
  });
});

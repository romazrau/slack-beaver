import { describe, expect, it } from "vitest";
import {
  formatSlackAgentReply,
  isDirectUserMessage,
  isMessageBeforeRuntimeStart,
  protectSocketModeClientFromConnectingDisconnect
} from "../src/slack/slackApp.js";

describe("formatSlackAgentReply", () => {
  it("wraps raw command output in a Slack markdown message payload", () => {
    const reply = formatSlackAgentReply("## Result\nUse **bold** formatting.");

    expect(reply.text).toContain("## Result");
    expect(reply.blocks).toHaveLength(1);
    expect(reply.blocks[0].type).toBe("section");
    expect(JSON.stringify(reply.blocks)).toContain("*Result*");
    expect(JSON.stringify(reply.blocks)).toContain("Use *bold* formatting.");
  });
});

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

describe("protectSocketModeClientFromConnectingDisconnect", () => {
  it("swallows Slack server disconnect messages while the Socket Mode client is connecting", async () => {
    const calls: unknown[] = [];
    const warnings: string[] = [];
    const client = {
      stateMachine: {
        getCurrentState: () => "connecting"
      },
      logger: {
        warn: (message: string) => warnings.push(message)
      },
      onWebSocketMessage: async (event: { data: unknown }) => {
        calls.push(event);
      }
    };

    protectSocketModeClientFromConnectingDisconnect(client);
    await client.onWebSocketMessage({
      data: JSON.stringify({ type: "disconnect", reason: "warning" })
    });

    expect(calls).toEqual([]);
    expect(warnings.join("\n")).toContain("server disconnect");
  });

  it("keeps normal Socket Mode messages on the SDK handler path", async () => {
    const calls: unknown[] = [];
    const client = {
      stateMachine: {
        getCurrentState: () => "connecting"
      },
      onWebSocketMessage: async (event: { data: unknown }) => {
        calls.push(event);
      }
    };

    protectSocketModeClientFromConnectingDisconnect(client);
    await client.onWebSocketMessage({
      data: JSON.stringify({ type: "hello" })
    });

    expect(calls).toHaveLength(1);
  });

  it("keeps connected disconnect messages on the SDK handler path", async () => {
    const calls: unknown[] = [];
    const client = {
      stateMachine: {
        getCurrentState: () => "connected"
      },
      onWebSocketMessage: async (event: { data: unknown }) => {
        calls.push(event);
      }
    };

    protectSocketModeClientFromConnectingDisconnect(client);
    await client.onWebSocketMessage({
      data: Buffer.from(JSON.stringify({ type: "disconnect", reason: "refresh_requested" }))
    });

    expect(calls).toHaveLength(1);
  });
});

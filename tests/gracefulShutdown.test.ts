import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config/config.js";
import { registerGracefulShutdownHandlers } from "../src/slack/gracefulShutdown.js";

function buildConfig(): AppConfig {
  return {
    slack: {
      socketModeEnabled: false
    },
    localFiles: {
      watchedFolders: [],
      denylistFolders: [],
      maxFileBytes: 1024,
      maxResults: 5
    },
    localMemory: {
      enabled: false,
      dbPath: ":memory:",
      openAiTokenPath: "/tmp/openai.key"
    },
    googleWorkspace: {
      enabled: false,
      tokenPath: "/tmp/google-oauth.json",
      redirectHost: "127.0.0.1"
    },
    ai: {
      openAiModel: "test-model",
      maxToolTurns: 2,
      maxConversationFullTurns: 8,
      conversationRecentTurnsAfterSummary: 4
    },
    auditLogPath: "/tmp/audit.jsonl"
  };
}

describe("registerGracefulShutdownHandlers", () => {
  it("logs notice failures and still stops the app before exiting", async () => {
    const listeners = new Map<NodeJS.Signals, (signal: NodeJS.Signals) => void>();
    const errors: string[] = [];
    const stopped: string[] = [];
    const exitCodes: number[] = [];

    registerGracefulShutdownHandlers({
      app: {
        async stop() {
          stopped.push("stopped");
        }
      },
      config: buildConfig(),
      async sendRuntimeNotice() {
        throw new Error("Slack post failed");
      },
      logger: {
        error(message) {
          errors.push(message);
        }
      },
      processSignals: {
        once(signal, listener) {
          listeners.set(signal, listener);
        }
      },
      exit(code) {
        exitCodes.push(code);
      }
    });

    listeners.get("SIGTERM")?.("SIGTERM");
    await Promise.resolve();
    await Promise.resolve();

    expect(errors.join("\n")).toContain("Slack post failed");
    expect(stopped).toEqual(["stopped"]);
    expect(exitCodes).toEqual([0]);
  });

  it("logs stop failures and still exits", async () => {
    const listeners = new Map<NodeJS.Signals, (signal: NodeJS.Signals) => void>();
    const errors: string[] = [];
    const exitCodes: number[] = [];

    registerGracefulShutdownHandlers({
      app: {
        async stop() {
          throw new Error("Socket close failed");
        }
      },
      config: buildConfig(),
      async sendRuntimeNotice() {},
      logger: {
        error(message) {
          errors.push(message);
        }
      },
      processSignals: {
        once(signal, listener) {
          listeners.set(signal, listener);
        }
      },
      exit(code) {
        exitCodes.push(code);
      }
    });

    listeners.get("SIGINT")?.("SIGINT");
    await Promise.resolve();
    await Promise.resolve();

    expect(errors.join("\n")).toContain("Socket close failed");
    expect(exitCodes).toEqual([0]);
  });
});

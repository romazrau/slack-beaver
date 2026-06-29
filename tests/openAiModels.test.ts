import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listSelectableOpenAiModels,
  resolveOpenAiModel,
  setOpenAiModel
} from "../src/agent/openAiModels.js";
import type { AppConfig } from "../src/config/config.js";
import { LocalMemoryStore } from "../src/memory/localMemory.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-openai-models-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

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
      enabled: true,
      dbPath: path.join(tempDir, "memory.sqlite"),
      openAiTokenPath: path.join(tempDir, "tokens", "openai.key")
    },
    ai: {
      openAiModel: "gpt-5.5",
      maxToolTurns: 2,
      maxConversationFullTurns: 8,
      conversationRecentTurnsAfterSummary: 4
    },
    auditLogPath: path.join(tempDir, "logs", "audit.jsonl")
  };
}

describe("OpenAI model selection", () => {
  it("lists only selectable Responses text models", async () => {
    await expect(
      listSelectableOpenAiModels({
        async listModels() {
          return [
            { id: "text-embedding-3-small" },
            { id: "gpt-5.5" },
            { id: "gpt-5.4-mini" },
            { id: "gpt-image-1" },
            { id: "gpt-4o-transcribe" },
            { id: "gpt-4o-mini-tts" },
            { id: "gpt-4o-realtime-preview" }
          ];
        }
      })
    ).resolves.toEqual(["gpt-5.4-mini", "gpt-5.5"]);
  });

  it("stores an available selected model", async () => {
    const store = new LocalMemoryStore(path.join(tempDir, "memory.sqlite"));

    await setOpenAiModel({
      modelId: "gpt-5.5",
      memoryStore: store,
      client: {
        async listModels() {
          return [{ id: "gpt-5.5" }];
        }
      }
    });

    expect(store.getSetting("openai.model")?.value).toBe("gpt-5.5");
    store.close();
  });

  it("rejects unavailable selected models", async () => {
    const store = new LocalMemoryStore(path.join(tempDir, "memory.sqlite"));

    await expect(
      setOpenAiModel({
        modelId: "gpt-missing",
        memoryStore: store,
        client: {
          async listModels() {
            return [{ id: "gpt-5.5" }];
          }
        }
      })
    ).rejects.toThrow("OpenAI model is not available to this API key");

    store.close();
  });

  it("rejects models that are not selectable Responses text models", async () => {
    const store = new LocalMemoryStore(path.join(tempDir, "memory.sqlite"));

    await expect(
      setOpenAiModel({
        modelId: "text-embedding-3-small",
        memoryStore: store,
        client: {
          async listModels() {
            return [{ id: "text-embedding-3-small" }];
          }
        }
      })
    ).rejects.toThrow("OpenAI model must be a selectable Responses text model");

    await expect(
      setOpenAiModel({
        modelId: "gpt-image-1",
        memoryStore: store,
        client: {
          async listModels() {
            return [{ id: "gpt-image-1" }];
          }
        }
      })
    ).rejects.toThrow("OpenAI model must be a selectable Responses text model");

    store.close();
  });

  it("resolves selected model before config model", () => {
    const config = buildConfig();
    const store = new LocalMemoryStore(config.localMemory.dbPath);
    store.setSetting("openai.model", "gpt-5.4-mini");

    expect(resolveOpenAiModel(config, store)).toBe("gpt-5.4-mini");

    store.close();
  });

  it("falls back to config model when no selected model is stored", () => {
    const config = buildConfig();
    const store = new LocalMemoryStore(config.localMemory.dbPath);

    expect(resolveOpenAiModel(config, store)).toBe("gpt-5.5");

    store.close();
  });
});

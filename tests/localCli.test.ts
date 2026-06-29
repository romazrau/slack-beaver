import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLocalCli } from "../src/cli/localCli.js";
import { LocalMemoryStore } from "../src/memory/localMemory.js";

let tempDir: string;
const originalEnv = { ...process.env };

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-local-cli-"));
  process.env = {
    ...originalEnv,
    SLACK_SOCKET_MODE_ENABLED: "true",
    SLACK_BOT_TOKEN: "",
    SLACK_APP_TOKEN: "",
    LOCAL_MEMORY_DB_PATH: path.join(tempDir, "memory.sqlite"),
    OPENAI_TOKEN_PATH: path.join(tempDir, "tokens", "openai.key")
  };
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("runLocalCli", () => {
  it("allows local setup commands without Slack tokens", async () => {
    const result = await runLocalCli(["folders:list"]);

    expect(result).toEqual({
      code: 0,
      message: "No allowed folders saved."
    });
  });

  it("shows the active default OpenAI model", async () => {
    const result = await runLocalCli(["models:current"]);

    expect(result).toEqual({
      code: 0,
      message: "Active OpenAI model: gpt-5.5"
    });
  });

  it("lists selectable OpenAI models and marks the active model", async () => {
    const store = new LocalMemoryStore(process.env.LOCAL_MEMORY_DB_PATH ?? "");
    store.setSetting("openai.model", "gpt-5.4-mini");
    store.close();

    const result = await runLocalCli(["models:list"], {
      openAiModelListClient: {
        async listModels() {
          return [{ id: "gpt-5.5" }, { id: "text-embedding-3-small" }, { id: "gpt-5.4-mini" }];
        }
      }
    });

    expect(result).toEqual({
      code: 0,
      message: "*\tgpt-5.4-mini\n \tgpt-5.5"
    });
  });

  it("warns when the active OpenAI model is not available to the API key", async () => {
    const result = await runLocalCli(["models:list"], {
      openAiModelListClient: {
        async listModels() {
          return [{ id: "gpt-5.4-mini" }];
        }
      }
    });

    expect(result).toEqual({
      code: 0,
      message: " \tgpt-5.4-mini\nWarning: active model is not available to this API key: gpt-5.5"
    });
  });

  it("sets the active OpenAI model when it is available", async () => {
    await expect(
      runLocalCli(["models:set", "gpt-5.5"], {
        openAiModelListClient: {
          async listModels() {
            return [{ id: "gpt-5.5" }];
          }
        }
      })
    ).resolves.toEqual({
      code: 0,
      message: "OpenAI model saved: gpt-5.5"
    });

    await expect(runLocalCli(["models:current"])).resolves.toEqual({
      code: 0,
      message: "Active OpenAI model: gpt-5.5"
    });
  });

  it("rejects unavailable OpenAI models", async () => {
    await expect(
      runLocalCli(["models:set", "gpt-missing"], {
        openAiModelListClient: {
          async listModels() {
            return [{ id: "gpt-5.5" }];
          }
        }
      })
    ).resolves.toEqual({
      code: 1,
      message: "OpenAI model is not available to this API key: gpt-missing"
    });
  });

  it("rejects OpenAI models that are not selectable Responses text models", async () => {
    await expect(
      runLocalCli(["models:set", "text-embedding-3-small"], {
        openAiModelListClient: {
          async listModels() {
            return [{ id: "text-embedding-3-small" }];
          }
        }
      })
    ).resolves.toEqual({
      code: 1,
      message: "OpenAI model must be a selectable Responses text model: text-embedding-3-small"
    });

    await expect(
      runLocalCli(["models:set", "gpt-4o-transcribe"], {
        openAiModelListClient: {
          async listModels() {
            return [{ id: "gpt-4o-transcribe" }];
          }
        }
      })
    ).resolves.toEqual({
      code: 1,
      message: "OpenAI model must be a selectable Responses text model: gpt-4o-transcribe"
    });
  });
});

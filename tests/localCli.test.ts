import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLocalCli } from "../src/cli/localCli.js";

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
});

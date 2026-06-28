import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { looksLikeAiToken, saveOpenAiToken } from "../src/setup/secretSetup.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-secret-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("secret setup", () => {
  it("detects token-like strings", () => {
    expect(looksLikeAiToken(`sk-${"1".repeat(30)}`)).toBe(true);
    expect(looksLikeAiToken("find onboarding")).toBe(false);
  });

  it("saves OpenAI token with restrictive permissions", async () => {
    const tokenPath = path.join(tempDir, "tokens", "openai.key");
    const fakeToken = `sk-${"1".repeat(30)}`;
    await saveOpenAiToken(tokenPath, fakeToken);

    const stat = await fs.stat(tokenPath);
    expect(stat.mode & 0o777).toBe(0o600);
    await expect(fs.readFile(tokenPath, "utf8")).resolves.toBe(`${fakeToken}\n`);
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateAllowedFolderInput } from "../src/setup/folderSetup.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-folder-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("validateAllowedFolderInput", () => {
  it("accepts absolute readable directories", async () => {
    const expectedPath = await fs.realpath(tempDir);
    await expect(validateAllowedFolderInput(tempDir, [])).resolves.toEqual({
      ok: true,
      path: expectedPath
    });
  });

  it("rejects relative paths and denied folders", async () => {
    await expect(validateAllowedFolderInput("relative", [])).resolves.toMatchObject({
      ok: false,
      reason: "Folder path must be absolute."
    });
    await expect(validateAllowedFolderInput(tempDir, [tempDir])).resolves.toMatchObject({
      ok: false,
      reason: "Folder path is denied by DENYLIST_FOLDERS."
    });
  });
});

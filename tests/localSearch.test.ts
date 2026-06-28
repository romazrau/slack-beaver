import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isPathAllowed, searchLocalFiles } from "../src/search/localSearch.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("isPathAllowed", () => {
  it("allows paths inside watched folders", () => {
    expect(isPathAllowed(path.join(tempDir, "notes.md"), [tempDir], [])).toBe(true);
  });

  it("rejects path traversal outside watched folders", () => {
    expect(isPathAllowed(path.join(tempDir, "..", "outside.md"), [tempDir], [])).toBe(false);
  });

  it("rejects paths inside denylist folders", () => {
    const denied = path.join(tempDir, "private");
    expect(isPathAllowed(path.join(denied, "secret.md"), [tempDir], [denied])).toBe(false);
  });
});

describe("searchLocalFiles", () => {
  it("finds files by filename and content with deterministic results", async () => {
    await fs.writeFile(path.join(tempDir, "onboarding.md"), "Welcome to the team", "utf8");
    await fs.writeFile(path.join(tempDir, "notes.txt"), "The onboarding checklist is ready", "utf8");

    const results = await searchLocalFiles("onboarding", {
      watchedFolders: [tempDir],
      denylistFolders: [],
      maxFileBytes: 1024,
      maxResults: 10
    });

    expect(results).toEqual([
      expect.objectContaining({ filename: "notes.txt", matchType: "content" }),
      expect.objectContaining({ filename: "onboarding.md", matchType: "filename" })
    ]);
  });

  it("skips denied folders, unsupported extensions, and oversized files", async () => {
    const denied = path.join(tempDir, "private");
    await fs.mkdir(denied);
    await fs.writeFile(path.join(denied, "secret.md"), "onboarding secret", "utf8");
    await fs.writeFile(path.join(tempDir, "image.png"), "onboarding", "utf8");
    await fs.writeFile(path.join(tempDir, "large.md"), "onboarding content too large", "utf8");
    await fs.writeFile(path.join(tempDir, "visible.md"), "onboarding visible", "utf8");

    const results = await searchLocalFiles("onboarding", {
      watchedFolders: [tempDir],
      denylistFolders: [denied],
      maxFileBytes: 20,
      maxResults: 10
    });

    expect(results.map((result) => result.filename)).toEqual(["visible.md"]);
  });

  it("respects result limits", async () => {
    await fs.writeFile(path.join(tempDir, "a.md"), "target", "utf8");
    await fs.writeFile(path.join(tempDir, "b.md"), "target", "utf8");

    const results = await searchLocalFiles("target", {
      watchedFolders: [tempDir],
      denylistFolders: [],
      maxFileBytes: 1024,
      maxResults: 1
    });

    expect(results).toHaveLength(1);
  });

  it("skips unreadable files without failing the search", async () => {
    const unreadablePath = path.join(tempDir, "unreadable.md");
    await fs.writeFile(unreadablePath, "target hidden", "utf8");
    await fs.chmod(unreadablePath, 0o000);
    await fs.writeFile(path.join(tempDir, "visible.md"), "target visible", "utf8");

    try {
      const results = await searchLocalFiles("target", {
        watchedFolders: [tempDir],
        denylistFolders: [],
        maxFileBytes: 1024,
        maxResults: 10
      });

      expect(results.map((result) => result.filename)).toEqual(["visible.md"]);
    } finally {
      await fs.chmod(unreadablePath, 0o600);
    }
  });

  it("rejects empty queries", async () => {
    await expect(
      searchLocalFiles(" ", {
        watchedFolders: [tempDir],
        denylistFolders: [],
        maxFileBytes: 1024,
        maxResults: 10
      })
    ).rejects.toThrow(/empty/);
  });
});

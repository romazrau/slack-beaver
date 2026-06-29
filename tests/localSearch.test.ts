import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isPathAllowed, readLocalTextFile, searchLocalFiles } from "../src/search/localSearch.js";
import { buildSimplePdf } from "./pdfFixture.js";

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

  it("finds PDF files by extracted content", async () => {
    await fs.writeFile(path.join(tempDir, "outline.pdf"), buildSimplePdf("Moonlit harbor PDF outline"), "binary");

    const results = await searchLocalFiles("harbor", {
      watchedFolders: [tempDir],
      denylistFolders: [],
      maxFileBytes: 4096,
      maxResults: 10
    });

    expect(results).toEqual([
      expect.objectContaining({
        filename: "outline.pdf",
        matchType: "content",
        snippet: expect.stringContaining("Moonlit harbor PDF outline")
      })
    ]);
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

describe("readLocalTextFile", () => {
  it("reads bounded content from an allowlisted supported text file", async () => {
    const filePath = path.join(tempDir, "plan.md");
    await fs.writeFile(filePath, "A".repeat(20), "utf8");

    const result = await readLocalTextFile(
      filePath,
      {
        watchedFolders: [tempDir],
        denylistFolders: [],
        maxFileBytes: 1024,
        maxResults: 10
      },
      5
    );

    expect(result).toEqual({
      path: filePath,
      filename: "plan.md",
      content: "AAAAA",
      truncated: true
    });
  });

  it("reads bounded extracted text from an allowlisted PDF file", async () => {
    const filePath = path.join(tempDir, "outline.pdf");
    await fs.writeFile(filePath, buildSimplePdf("Chapter One local PDF content"), "binary");

    const result = await readLocalTextFile(filePath, {
      watchedFolders: [tempDir],
      denylistFolders: [],
      maxFileBytes: 4096,
      maxResults: 10
    });

    expect(result).toMatchObject({
      path: filePath,
      filename: "outline.pdf",
      content: expect.stringContaining("Chapter One local PDF content"),
      truncated: false
    });
  });

  it("reports truncated when bounded PDF extraction drops content", async () => {
    const filePath = path.join(tempDir, "long-outline.pdf");
    await fs.writeFile(filePath, buildSimplePdf("Chapter One local PDF content"), "binary");

    const result = await readLocalTextFile(
      filePath,
      {
        watchedFolders: [tempDir],
        denylistFolders: [],
        maxFileBytes: 4096,
        maxResults: 10
      },
      7
    );

    expect(result).toMatchObject({
      path: filePath,
      filename: "long-outline.pdf",
      content: "Chapter",
      truncated: true
    });
  });

  it("rejects paths outside watched folders", async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "slack-beaver-outside-"));
    const outsidePath = path.join(outsideDir, "secret.md");
    await fs.writeFile(outsidePath, "secret", "utf8");

    try {
      await expect(
        readLocalTextFile(outsidePath, {
          watchedFolders: [tempDir],
          denylistFolders: [],
          maxFileBytes: 1024,
          maxResults: 10
        })
      ).rejects.toThrow(/allowlisted/);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it("rejects denied, unsupported, and oversized files", async () => {
    const denied = path.join(tempDir, "private");
    await fs.mkdir(denied);
    const deniedPath = path.join(denied, "secret.md");
    const unsupportedPath = path.join(tempDir, "image.png");
    const oversizedPath = path.join(tempDir, "large.md");
    await fs.writeFile(deniedPath, "secret", "utf8");
    await fs.writeFile(unsupportedPath, "not really an image", "utf8");
    await fs.writeFile(oversizedPath, "0123456789", "utf8");

    const options = {
      watchedFolders: [tempDir],
      denylistFolders: [denied],
      maxFileBytes: 5,
      maxResults: 10
    };

    await expect(readLocalTextFile(deniedPath, options)).rejects.toThrow(/denied/);
    await expect(readLocalTextFile(unsupportedPath, options)).rejects.toThrow(/extension/);
    await expect(readLocalTextFile(oversizedPath, options)).rejects.toThrow(/larger/);
  });

  it("rejects empty paths", async () => {
    await expect(
      readLocalTextFile(" ", {
        watchedFolders: [tempDir],
        denylistFolders: [],
        maxFileBytes: 1024,
        maxResults: 10
      })
    ).rejects.toThrow(/empty/);
  });
});

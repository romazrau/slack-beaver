import fs from "node:fs/promises";
import path from "node:path";

export const SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json"]);

export type MatchType = "filename" | "content";

export type SearchResult = {
  path: string;
  filename: string;
  matchType: MatchType;
  snippet: string;
};

export type LocalFileReadResult = {
  path: string;
  filename: string;
  content: string;
  truncated: boolean;
};

export type LocalSearchOptions = {
  watchedFolders: string[];
  denylistFolders: string[];
  maxFileBytes: number;
  maxResults: number;
  snippetLength?: number;
};

type CandidateFile = {
  path: string;
  filename: string;
};

const DEFAULT_SNIPPET_LENGTH = 160;
const DEFAULT_READ_MAX_CHARS = 4000;

export function isPathAllowed(
  targetPath: string,
  watchedFolders: string[],
  denylistFolders: string[]
): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedWatched = watchedFolders.map((folder) => path.resolve(folder));
  const resolvedDenied = denylistFolders.map((folder) => path.resolve(folder));

  const insideWatched = resolvedWatched.some((folder) => isSameOrChildPath(resolvedTarget, folder));
  if (!insideWatched) {
    return false;
  }

  return !resolvedDenied.some((folder) => isSameOrChildPath(resolvedTarget, folder));
}

export async function searchLocalFiles(
  query: string,
  options: LocalSearchOptions
): Promise<SearchResult[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    throw new Error("Search query cannot be empty.");
  }

  const candidates = await collectCandidateFiles(options);
  const results: SearchResult[] = [];

  for (const file of candidates) {
    if (results.length >= options.maxResults) {
      break;
    }

    const filenameMatch = file.filename.toLowerCase().includes(normalizedQuery);
    if (filenameMatch) {
      results.push({
        path: file.path,
        filename: file.filename,
        matchType: "filename",
        snippet: file.filename
      });
      continue;
    }

    const content = await readTextFile(file.path);
    if (content === undefined) {
      continue;
    }

    const normalizedContent = normalizeContent(content);
    const contentIndex = normalizedContent.toLowerCase().indexOf(normalizedQuery);
    if (contentIndex >= 0) {
      results.push({
        path: file.path,
        filename: file.filename,
        matchType: "content",
        snippet: buildSnippet(
          normalizedContent,
          contentIndex,
          options.snippetLength ?? DEFAULT_SNIPPET_LENGTH
        )
      });
    }
  }

  return results;
}

export async function readLocalTextFile(
  targetPath: string,
  options: LocalSearchOptions,
  maxChars = DEFAULT_READ_MAX_CHARS
): Promise<LocalFileReadResult> {
  const resolvedPath = path.resolve(targetPath.trim());
  if (!targetPath.trim()) {
    throw new Error("Local file path cannot be empty.");
  }

  const insideWatched = options.watchedFolders
    .map((folder) => path.resolve(folder))
    .some((folder) => isSameOrChildPath(resolvedPath, folder));
  if (!insideWatched) {
    throw new Error("Local file path is not inside an allowlisted folder.");
  }

  const insideDenied = options.denylistFolders
    .map((folder) => path.resolve(folder))
    .some((folder) => isSameOrChildPath(resolvedPath, folder));
  if (insideDenied) {
    throw new Error("Local file path is inside a denied folder.");
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error("Local file extension is not supported.");
  }

  const stat = await statFile(resolvedPath);
  if (stat === undefined || !stat.isFile()) {
    throw new Error("Local file does not exist or is not a file.");
  }

  if (stat.size > options.maxFileBytes) {
    throw new Error("Local file is larger than the configured maximum.");
  }

  const content = await readTextFile(resolvedPath);
  if (content === undefined) {
    throw new Error("Local file could not be read as text.");
  }

  const bounded = content.length > maxChars ? content.slice(0, maxChars) : content;
  return {
    path: resolvedPath,
    filename: path.basename(resolvedPath),
    content: bounded,
    truncated: bounded.length < content.length
  };
}

async function collectCandidateFiles(options: LocalSearchOptions): Promise<CandidateFile[]> {
  const files: CandidateFile[] = [];

  for (const watchedFolder of options.watchedFolders) {
    const resolvedFolder = path.resolve(watchedFolder);
    if (!isPathAllowed(resolvedFolder, options.watchedFolders, options.denylistFolders)) {
      continue;
    }
    await walkDirectory(resolvedFolder, options, files);
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function walkDirectory(
  directory: string,
  options: LocalSearchOptions,
  files: CandidateFile[]
): Promise<void> {
  if (!isPathAllowed(directory, options.watchedFolders, options.denylistFolders)) {
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (!isPathAllowed(entryPath, options.watchedFolders, options.denylistFolders)) {
      continue;
    }

    if (entry.isDirectory()) {
      await walkDirectory(entryPath, options, files);
      continue;
    }

    if (!entry.isFile() || !SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    const stat = await statFile(entryPath);
    if (stat === undefined) {
      continue;
    }

    if (stat.size > options.maxFileBytes) {
      continue;
    }

    files.push({
      path: path.resolve(entryPath),
      filename: entry.name
    });
  }
}

function isSameOrChildPath(targetPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function statFile(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch {
    return undefined;
  }
}

async function readTextFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function buildSnippet(normalized: string, matchIndex: number, maxLength: number): string {
  const prefixLength = Math.max(Math.floor(maxLength / 3), 0);
  const start = Math.max(matchIndex - prefixLength, 0);
  const snippet = normalized.slice(start, start + maxLength);

  const prefix = start > 0 ? "..." : "";
  const suffix = start + maxLength < normalized.length ? "..." : "";
  return `${prefix}${snippet}${suffix}`;
}

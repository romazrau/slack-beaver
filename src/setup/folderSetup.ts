import fs from "node:fs/promises";
import path from "node:path";

export type FolderValidationResult =
  | { ok: true; path: string }
  | { ok: false; reason: string };

export async function validateAllowedFolderInput(
  inputPath: string,
  denylistFolders: string[]
): Promise<FolderValidationResult> {
  const trimmed = inputPath.trim();
  if (!path.isAbsolute(trimmed)) {
    return { ok: false, reason: "Folder path must be absolute." };
  }

  let realPath: string;
  try {
    realPath = await fs.realpath(trimmed);
  } catch {
    return { ok: false, reason: "Folder path does not exist or cannot be resolved." };
  }

  const stat = await fs.stat(realPath);
  if (!stat.isDirectory()) {
    return { ok: false, reason: "Path must point to a directory." };
  }

  const resolvedDenied = await Promise.all(denylistFolders.map(resolveDenylistPath));
  if (resolvedDenied.some((folder) => isSameOrChildPath(realPath, folder))) {
    return { ok: false, reason: "Folder path is denied by DENYLIST_FOLDERS." };
  }

  try {
    await fs.access(realPath, fs.constants.R_OK);
  } catch {
    return { ok: false, reason: "Folder is not readable by this OS user." };
  }

  return { ok: true, path: path.resolve(realPath) };
}

async function resolveDenylistPath(folder: string): Promise<string> {
  try {
    return await fs.realpath(folder);
  } catch {
    return path.resolve(folder);
  }
}

function isSameOrChildPath(targetPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

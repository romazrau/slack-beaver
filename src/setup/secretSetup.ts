import fs from "node:fs/promises";
import path from "node:path";

export function looksLikeAiToken(text: string): boolean {
  return /\b(sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,})\b/.test(text);
}

export async function saveOpenAiToken(tokenPath: string, token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("OpenAI token cannot be empty.");
  }
  if (!looksLikeAiToken(trimmed)) {
    throw new Error("OpenAI token must look like an API key.");
  }

  await fs.mkdir(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(tokenPath, `${trimmed}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(tokenPath, 0o600);
}

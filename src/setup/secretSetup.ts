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

export async function loadOpenAiToken(tokenPath: string): Promise<string> {
  let stat;
  try {
    stat = await fs.stat(tokenPath);
  } catch {
    throw new Error("OpenAI token is not configured. Run `npm run agent:secrets:set-openai`.");
  }

  if (!stat.isFile()) {
    throw new Error("OpenAI token path is not a file. Run `npm run agent:secrets:set-openai`.");
  }

  if ((stat.mode & 0o077) !== 0) {
    throw new Error("OpenAI token file permissions are too broad. Run `npm run agent:secrets:set-openai`.");
  }

  const token = (await fs.readFile(tokenPath, "utf8")).trim();
  if (!looksLikeAiToken(token)) {
    throw new Error("OpenAI token is invalid. Run `npm run agent:secrets:set-openai`.");
  }

  return token;
}

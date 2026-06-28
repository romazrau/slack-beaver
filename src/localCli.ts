import { stdin as input, stdout as output } from "node:process";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { validateAllowedFolderInput } from "./folderSetup.js";
import { LocalMemoryStore } from "./localMemory.js";
import { saveOpenAiToken } from "./secretSetup.js";

type CliResult = {
  code: number;
  message: string;
};

export async function runLocalCli(argv: string[] = process.argv.slice(2)): Promise<CliResult> {
  const [command, ...rest] = argv;
  const config = loadConfig(process.env);
  const store = new LocalMemoryStore(config.localMemory.dbPath);

  try {
    if (command === "folders:add") {
      const folderInput = rest.join(" ").trim();
      if (!folderInput) {
        return { code: 1, message: "Usage: npm run agent:folders:add -- /absolute/path" };
      }
      const validation = await validateAllowedFolderInput(folderInput, config.localFiles.denylistFolders);
      if (!validation.ok) {
        return { code: 1, message: validation.reason };
      }
      store.upsertAllowedFolder(validation.path);
      return { code: 0, message: `Allowed folder saved: ${validation.path}` };
    }

    if (command === "folders:list") {
      const folders = store.listAllowedFolders();
      if (folders.length === 0) {
        return { code: 0, message: "No allowed folders saved." };
      }
      return {
        code: 0,
        message: folders
          .map((folder) => `${folder.enabled ? "enabled" : "disabled"}\t${folder.path}`)
          .join("\n")
      };
    }

    if (command === "folders:remove") {
      const folderInput = rest.join(" ").trim();
      if (!folderInput) {
        return { code: 1, message: "Usage: npm run agent:folders:remove -- /absolute/path" };
      }
      const removed = store.disableAllowedFolder(folderInput);
      return {
        code: removed ? 0 : 1,
        message: removed ? `Allowed folder disabled: ${folderInput}` : "Allowed folder was not enabled."
      };
    }

    if (command === "secrets:set-openai") {
      const token = await readSecret("OpenAI API key: ");
      await saveOpenAiToken(config.localMemory.openAiTokenPath, token);
      store.setProviderTokenConfigured("openai", true);
      return { code: 0, message: "OpenAI token saved locally." };
    }

    return {
      code: 1,
      message:
        "Usage: npm run agent:folders:add -- /absolute/path | npm run agent:folders:list | npm run agent:folders:remove -- /absolute/path | npm run agent:secrets:set-openai"
    };
  } finally {
    store.close();
  }
}

async function readSecret(prompt: string): Promise<string> {
  if (!input.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of input) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8").trim();
  }

  input.setRawMode(true);
  output.write(prompt);
  let value = "";

  try {
    for await (const chunk of input) {
      const text = chunk.toString("utf8");
      for (const char of text) {
        if (char === "\r" || char === "\n") {
          output.write("\n");
          return value;
        }
        if (char === "\u0003") {
          throw new Error("Cancelled.");
        }
        if (char === "\b" || char === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    }
  } finally {
    input.setRawMode(false);
  }

  return value;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLocalCli()
    .then((result) => {
      const writer = result.code === 0 ? console.log : console.error;
      writer(result.message);
      process.exitCode = result.code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "Unknown CLI error");
      process.exitCode = 1;
    });
}

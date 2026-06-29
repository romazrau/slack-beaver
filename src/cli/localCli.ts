import "dotenv/config";
import { stdin as input, stdout as output } from "node:process";
import { pathToFileURL } from "node:url";
import {
  createConfiguredOpenAiModelListClient,
  listOpenAiModelSelection,
  OPENAI_MODEL_SETTING_KEY,
  setOpenAiModel,
  type OpenAiModelListClient
} from "../agent/openAiModels.js";
import { loadConfig } from "../config/config.js";
import {
  deleteGoogleOAuthToken,
  GOOGLE_ACCOUNT_EMAIL_SETTING_KEY,
  GOOGLE_GRANTED_SCOPES_SETTING_KEY,
  GOOGLE_PROVIDER_NAME,
  loadGoogleOAuthToken,
  runGoogleOAuthLogin,
  type GoogleOAuthLoginResult
} from "../google/googleAuth.js";
import { LocalMemoryStore } from "../memory/localMemory.js";
import {
  formatOpenAiSetupGuidance,
  formatResetCompletedGuidance,
  formatResetRefusalGuidance
} from "../slack/onboardingCopy.js";
import { validateAllowedFolderInput } from "../setup/folderSetup.js";
import { saveOpenAiToken } from "../setup/secretSetup.js";

type CliResult = {
  code: number;
  message: string;
};

type LocalCliOptions = {
  openAiModelListClient?: OpenAiModelListClient;
  googleOAuthLogin?: (input: { config: ReturnType<typeof loadConfig> }) => Promise<GoogleOAuthLoginResult>;
};

export async function runLocalCli(
  argv: string[] = process.argv.slice(2),
  options: LocalCliOptions = {}
): Promise<CliResult> {
  const [command, ...rest] = argv;
  const config = loadConfig(process.env, { requireSlackTokens: false });
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

    if (command === "models:list") {
      return await listModels(config, store, options);
    }

    if (command === "models:current") {
      return {
        code: 0,
        message: `Active OpenAI model: ${store.getSetting(OPENAI_MODEL_SETTING_KEY)?.value.trim() || config.ai.openAiModel}`
      };
    }

    if (command === "models:set") {
      const modelId = rest.join(" ").trim();
      if (!modelId) {
        return { code: 1, message: "Usage: npm run agent:models:set -- <model-id>" };
      }
      return await setModel(modelId, config, store, options);
    }

    if (command === "google:login") {
      return await loginGoogle(config, store, options);
    }

    if (command === "google:status") {
      return await googleStatus(config, store);
    }

    if (command === "google:logout") {
      await deleteGoogleOAuthToken(config.googleWorkspace.tokenPath);
      store.setProviderTokenConfigured(GOOGLE_PROVIDER_NAME, false);
      store.deleteSetting(GOOGLE_GRANTED_SCOPES_SETTING_KEY);
      store.deleteSetting(GOOGLE_ACCOUNT_EMAIL_SETTING_KEY);
      return { code: 0, message: "Google account disconnected locally." };
    }

    if (command === "memory:reset") {
      return resetMemory(rest, store);
    }

    return {
      code: 1,
      message:
        "Usage: npm run agent:folders:add -- /absolute/path | npm run agent:folders:list | npm run agent:folders:remove -- /absolute/path | npm run agent:secrets:set-openai | npm run agent:models:list | npm run agent:models:current | npm run agent:models:set -- <model-id> | npm run agent:google:login | npm run agent:google:status | npm run agent:google:logout | npm run agent:memory:reset -- --confirm RESET_LOCAL_MEMORY --yes"
    };
  } finally {
    store.close();
  }
}

async function loginGoogle(
  config: ReturnType<typeof loadConfig>,
  store: LocalMemoryStore,
  options: LocalCliOptions
): Promise<CliResult> {
  try {
    const result = await (options.googleOAuthLogin ?? runGoogleOAuthLogin)({ config });
    store.setProviderTokenConfigured(GOOGLE_PROVIDER_NAME, true);
    store.setSetting(GOOGLE_GRANTED_SCOPES_SETTING_KEY, result.scopes.join(" "));
    if (result.accountEmail) {
      store.setSetting(GOOGLE_ACCOUNT_EMAIL_SETTING_KEY, result.accountEmail);
    }

    return {
      code: 0,
      message: [
        "Google account connected locally.",
        result.accountEmail ? `Account: ${result.accountEmail}` : undefined,
        `Scopes: ${result.scopes.join(" ")}`
      ]
        .filter(Boolean)
        .join("\n")
    };
  } catch (error) {
    return {
      code: 1,
      message: `Unable to connect Google account. ${formatErrorMessage(error)}`
    };
  }
}

async function googleStatus(config: ReturnType<typeof loadConfig>, store: LocalMemoryStore): Promise<CliResult> {
  const provider = store.getProviderConfig(GOOGLE_PROVIDER_NAME);
  if (!provider?.tokenConfigured) {
    return {
      code: 0,
      message: "Google account is not connected locally. Run `npm run agent:google:login`."
    };
  }

  try {
    const token = await loadGoogleOAuthToken(config.googleWorkspace.tokenPath);
    return {
      code: 0,
      message: [
        "Google account is connected locally.",
        store.getSetting(GOOGLE_ACCOUNT_EMAIL_SETTING_KEY)?.value
          ? `Account: ${store.getSetting(GOOGLE_ACCOUNT_EMAIL_SETTING_KEY)?.value}`
          : token.accountEmail
            ? `Account: ${token.accountEmail}`
            : undefined,
        `Scopes: ${(store.getSetting(GOOGLE_GRANTED_SCOPES_SETTING_KEY)?.value || token.scopes.join(" ")).trim()}`
      ]
        .filter(Boolean)
        .join("\n")
    };
  } catch (error) {
    return {
      code: 1,
      message: `Google account metadata exists, but the local token is not usable. ${formatErrorMessage(error)}`
    };
  }
}

async function listModels(
  config: ReturnType<typeof loadConfig>,
  store: LocalMemoryStore,
  options: LocalCliOptions
): Promise<CliResult> {
  try {
    const client = options.openAiModelListClient ?? (await createConfiguredOpenAiModelListClient(config));
    const selection = await listOpenAiModelSelection({ config, memoryStore: store, client });
    const lines =
      selection.models.length === 0
        ? ["No selectable Responses text models are available to this API key."]
        : selection.models.map((model) => `${model === selection.activeModel ? "*" : " "}\t${model}`);

    if (!selection.activeModelAvailable) {
      lines.push(`Warning: active model is not available to this API key: ${selection.activeModel}`);
    }

    return {
      code: 0,
      message: lines.join("\n")
    };
  } catch (error) {
    if (isOpenAiTokenSetupError(error)) {
      return {
        code: 1,
        message: formatOpenAiSetupGuidance()
      };
    }

    return {
      code: 1,
      message: `Unable to list OpenAI models. Confirm the API key has List models: Read. ${formatErrorMessage(error)}`
    };
  }
}

async function setModel(
  modelId: string,
  config: ReturnType<typeof loadConfig>,
  store: LocalMemoryStore,
  options: LocalCliOptions
): Promise<CliResult> {
  try {
    const client = options.openAiModelListClient ?? (await createConfiguredOpenAiModelListClient(config));
    const selectedModel = await setOpenAiModel({ modelId, memoryStore: store, client });
    return {
      code: 0,
      message: `OpenAI model saved: ${selectedModel}`
    };
  } catch (error) {
    if (isOpenAiTokenSetupError(error)) {
      return {
        code: 1,
        message: formatOpenAiSetupGuidance()
      };
    }

    return {
      code: 1,
      message: formatErrorMessage(error)
    };
  }
}

function isOpenAiTokenSetupError(error: unknown): boolean {
  const message = formatErrorMessage(error);
  return message.includes("OpenAI token") || message.includes("AI agent token");
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown OpenAI model error";
}

function resetMemory(args: string[], store: LocalMemoryStore): CliResult {
  const confirmIndex = args.indexOf("--confirm");
  const confirmation = confirmIndex >= 0 ? args[confirmIndex + 1] : undefined;
  const hasYes = args.includes("--yes");

  if (confirmation !== "RESET_LOCAL_MEMORY" || !hasYes) {
    return {
      code: 1,
      message: formatResetRefusalGuidance()
    };
  }

  const counts = store.resetAll();
  return {
    code: 0,
    message: formatResetCompletedGuidance(counts)
  };
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

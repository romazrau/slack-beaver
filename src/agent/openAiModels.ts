import OpenAI from "openai";
import type { AppConfig } from "../config/config.js";
import type { LocalMemoryStore } from "../memory/localMemory.js";
import { loadOpenAiToken } from "../setup/secretSetup.js";

export const OPENAI_MODEL_SETTING_KEY = "openai.model";

export type OpenAiModelInfo = {
  id: string;
};

export type OpenAiModelListClient = {
  listModels(): Promise<OpenAiModelInfo[]>;
};

export type OpenAiModelSelection = {
  activeModel: string;
  models: string[];
  activeModelAvailable: boolean;
};

export async function createConfiguredOpenAiModelListClient(config: AppConfig): Promise<OpenAiModelListClient> {
  const token = await loadOpenAiToken(config.localMemory.openAiTokenPath);
  const client = new OpenAI({ apiKey: token });

  return {
    async listModels(): Promise<OpenAiModelInfo[]> {
      const models = await client.models.list();
      return models.data.map((model) => ({ id: model.id }));
    }
  };
}

export async function listSelectableOpenAiModels(client: OpenAiModelListClient): Promise<string[]> {
  const models = await client.listModels();
  return models
    .map((model) => model.id)
    .filter(isSelectableOpenAiResponsesTextModel)
    .sort((left, right) => left.localeCompare(right));
}

export async function listOpenAiModelSelection(input: {
  config: AppConfig;
  memoryStore?: LocalMemoryStore;
  client: OpenAiModelListClient;
}): Promise<OpenAiModelSelection> {
  const models = await listSelectableOpenAiModels(input.client);
  const activeModel = resolveOpenAiModel(input.config, input.memoryStore);

  return {
    activeModel,
    models,
    activeModelAvailable: models.includes(activeModel)
  };
}

export async function setOpenAiModel(input: {
  modelId: string;
  memoryStore: LocalMemoryStore;
  client: OpenAiModelListClient;
}): Promise<string> {
  if (!isSelectableOpenAiResponsesTextModel(input.modelId)) {
    throw new Error(`OpenAI model must be a selectable Responses text model: ${input.modelId}`);
  }

  const models = await listSelectableOpenAiModels(input.client);
  if (!models.includes(input.modelId)) {
    throw new Error(`OpenAI model is not available to this API key: ${input.modelId}`);
  }

  input.memoryStore.setSetting(OPENAI_MODEL_SETTING_KEY, input.modelId);
  return input.modelId;
}

export function resolveOpenAiModel(config: AppConfig, memoryStore?: LocalMemoryStore): string {
  return memoryStore?.getSetting(OPENAI_MODEL_SETTING_KEY)?.value.trim() || config.ai.openAiModel;
}

function isSelectableOpenAiResponsesTextModel(modelId: string): boolean {
  if (!modelId.startsWith("gpt-")) {
    return false;
  }

  const specializedModelMarkers = ["audio", "image", "realtime", "transcribe", "tts", "whisper"];
  return !specializedModelMarkers.some((marker) => modelId.toLowerCase().includes(marker));
}

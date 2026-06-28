import OpenAI from "openai";
import type { AgentModelClient, AgentModelOutput } from "./agentRunner.js";

type OpenAiResponsesModelClientOptions = {
  apiKey: string;
  model: string;
};

export function createOpenAiResponsesModelClient(
  options: OpenAiResponsesModelClientOptions
): AgentModelClient {
  const client = new OpenAI({ apiKey: options.apiKey });

  return {
    async createResponse(input): Promise<AgentModelOutput> {
      const response = await client.responses.create({
        model: options.model,
        instructions: input.instructions,
        input:
          input.toolOutputs.length > 0
            ? input.toolOutputs.map((toolOutput) => ({
                type: "function_call_output" as const,
                call_id: toolOutput.callId,
                output: toolOutput.output
              }))
            : input.question,
        previous_response_id: input.previousResponseId,
        tools: input.tools
      });

      return {
        responseId: response.id,
        finalAnswer: response.output_text || undefined,
        toolCalls: response.output
          .filter((item) => item.type === "function_call")
          .map((item) => ({
            id: item.call_id,
            name: item.name,
            input: parseToolArguments(item.arguments)
          }))
      };
    }
  };
}

function parseToolArguments(argumentsJson: string): unknown {
  try {
    return JSON.parse(argumentsJson);
  } catch {
    return {};
  }
}

import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import type { ModelProvider } from "./types.js";

export type { ModelProvider, Message, Tool, ModelResponse, ToolCall } from "./types.js";

export { AnthropicProvider, OpenAIProvider };

/**
 * Get model provider based on environment or parameter
 */
export function getModelProvider(
  providerName?: string
): ModelProvider {
  const provider =
    providerName || process.env["MODEL_PROVIDER"] || "openai";

  switch (provider.toLowerCase()) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAIProvider();
    default:
      throw new Error(`Unknown model provider: ${provider}`);
  }
}

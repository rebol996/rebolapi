import type { ProviderType } from "@/types/database";
import type { ProviderAdapter } from "./types";
import { OpenAICompatibleAdapter } from "./openai-compatible";
import { AnthropicAdapter } from "./anthropic";
import { GeminiAdapter } from "./gemini";
import { OpenRouterAdapter } from "./openrouter";

const adapters: Partial<Record<ProviderType, ProviderAdapter>> = {
  openai_compatible: new OpenAICompatibleAdapter(),
  anthropic: new AnthropicAdapter(),
  gemini: new GeminiAdapter(),
  openrouter: new OpenRouterAdapter(),
  custom: new OpenAICompatibleAdapter(),
};

export function getAdapter(providerType: ProviderType): ProviderAdapter {
  const adapter = adapters[providerType];
  if (!adapter) throw new Error(`No adapter for provider type: ${providerType}`);
  return adapter;
}

export { OpenAICompatibleAdapter, AnthropicAdapter, GeminiAdapter, OpenRouterAdapter };

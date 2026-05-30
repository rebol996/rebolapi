import { OpenAICompatibleAdapter } from "./openai-compatible";
import type { DiscoveryResult, ChatRequest, ChatResponse, StreamChunk } from "./types";
import { createTimeoutSignal } from "./utils";

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai";

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  private getBaseUrl(baseUrl: string): string {
    return baseUrl?.trim() || OPENROUTER_DEFAULT_BASE_URL;
  }

  async discoverModels(apiKey: string, baseUrl: string): Promise<DiscoveryResult> {
    const url = `${this.getBaseUrl(baseUrl)}/api/v1/models`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: createTimeoutSignal(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw { type: "discovery_error", message: `HTTP ${res.status}: ${body}`, status: res.status, retryable: res.status >= 500 || res.status === 429 };
    }
    const data = await res.json();
    const models = (data.data || []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      name: m.name as string || m.id as string,
      owned_by: (m.id as string).split("/")[0],
      context_length: m.context_length as number | undefined,
    }));
    return { models, raw: JSON.stringify(data).slice(0, 5000) };
  }

  async chatCompletion(apiKey: string, baseUrl: string, request: ChatRequest): Promise<ChatResponse> {
    return super.chatCompletion(apiKey, this.getBaseUrl(baseUrl), request);
  }

  async *chatCompletionStream(apiKey: string, baseUrl: string, request: ChatRequest): AsyncGenerator<StreamChunk> {
    yield* super.chatCompletionStream!(apiKey, this.getBaseUrl(baseUrl), request);
  }
}

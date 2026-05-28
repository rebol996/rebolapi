import { OpenAICompatibleAdapter } from "./openai-compatible";
import type { DiscoveryResult } from "./types";

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async discoverModels(apiKey: string, _baseUrl: string): Promise<DiscoveryResult> {
    const url = "https://openrouter.ai/api/v1/models";
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
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
}

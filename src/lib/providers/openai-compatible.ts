import type { ProviderAdapter, ChatRequest, ChatResponse, StreamChunk, DiscoveryResult, AdapterError, DiscoveryModel } from "./types";
import { createTimeoutSignal } from "./utils";

export class OpenAICompatibleAdapter implements ProviderAdapter {
  async discoverModels(apiKey: string, baseUrl: string): Promise<DiscoveryResult> {
    const url = `${baseUrl}/v1/models`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: createTimeoutSignal(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw { type: "discovery_error", message: `HTTP ${res.status}: ${body}`, status: res.status, retryable: res.status >= 500 || res.status === 429 };
    }
    const data = await res.json();
    const models: DiscoveryModel[] = (data.data || []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      name: (m.id as string),
      owned_by: m.owned_by as string | undefined,
      context_length: m.context_length as number | undefined,
    }));
    return { models, raw: JSON.stringify(data).slice(0, 5000) };
  }

  async chatCompletion(apiKey: string, baseUrl: string, request: ChatRequest): Promise<ChatResponse> {
    const url = `${baseUrl}/v1/chat/completions`;
    const start = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...request, stream: false }),
      signal: createTimeoutSignal(),
    });
    const latency_ms = Date.now() - start;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw { type: "chat_error", message: `HTTP ${res.status}: ${body}`, status: res.status, retryable: res.status >= 500 || res.status === 429 };
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    return {
      id: data.id || "",
      model: data.model || request.model,
      content: choice?.message?.content || "",
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
      finish_reason: choice?.finish_reason || "",
      latency_ms,
    };
  }

  async *chatCompletionStream(apiKey: string, baseUrl: string, request: ChatRequest): AsyncGenerator<StreamChunk> {
    const url = `${baseUrl}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...request, stream: true }),
      signal: createTimeoutSignal(),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw { type: "chat_error", message: `HTTP ${res.status}: ${body}`, status: res.status, retryable: res.status >= 500 || res.status === 429 };
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw { type: "stream_error", message: "No response body", retryable: false };
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let id = "";
    let model = request.model;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));
            id = data.id || id;
            model = data.model || model;

            const choice = data.choices?.[0];
            if (choice) {
              const delta = choice.delta?.content || "";
              const finishReason = choice.finish_reason || null;

              yield {
                id,
                model,
                delta,
                finish_reason: finishReason,
                input_tokens: data.usage?.prompt_tokens,
                output_tokens: data.usage?.completion_tokens,
              };
            }
          } catch {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  parseError(error: unknown): AdapterError {
    if (typeof error === "object" && error !== null && "status" in error) {
      const e = error as { type?: string; message?: string; status?: number; retryable?: boolean };
      return {
        type: e.type || "unknown",
        message: e.message || "Unknown error",
        status: e.status,
        retryable: e.retryable ?? false,
      };
    }
    return { type: "unknown", message: String(error), retryable: false };
  }
}

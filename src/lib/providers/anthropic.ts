import type { ProviderAdapter, ChatRequest, ChatResponse, StreamChunk, DiscoveryResult, AdapterError, DiscoveryModel } from "./types";

export class AnthropicAdapter implements ProviderAdapter {
  async discoverModels(apiKey: string, baseUrl: string): Promise<DiscoveryResult> {
    const url = `${baseUrl}/v1/models`;
    const res = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw { type: "discovery_error", message: `HTTP ${res.status}: ${body}`, status: res.status, retryable: res.status >= 500 || res.status === 429 };
    }
    const data = await res.json();
    const models: DiscoveryModel[] = (data.data || []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      name: (m.display_name as string) || (m.id as string),
      owned_by: "anthropic",
      context_length: m.context_window as number | undefined,
    }));
    return { models, raw: JSON.stringify(data).slice(0, 5000) };
  }

  async chatCompletion(apiKey: string, baseUrl: string, request: ChatRequest): Promise<ChatResponse> {
    const url = `${baseUrl}/v1/messages`;
    const systemMessage = request.messages.find((m) => m.role === "system")?.content;
    const nonSystemMessages = request.messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.max_tokens || 4096,
      messages: nonSystemMessages,
      stream: false,
    };
    if (systemMessage) body.system = systemMessage;
    if (request.temperature != null) body.temperature = request.temperature;

    const start = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const latency_ms = Date.now() - start;
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw { type: "chat_error", message: `HTTP ${res.status}: ${errBody}`, status: res.status, retryable: res.status >= 500 || res.status === 429 };
    }
    const data = await res.json();
    const content = (data.content || []).filter((c: Record<string, unknown>) => c.type === "text").map((c: Record<string, unknown>) => c.text).join("");
    return {
      id: data.id || "",
      model: data.model || request.model,
      content,
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      finish_reason: data.stop_reason || "",
      latency_ms,
    };
  }

  async *chatCompletionStream(apiKey: string, baseUrl: string, request: ChatRequest): AsyncGenerator<StreamChunk> {
    const url = `${baseUrl}/v1/messages`;
    const systemMessage = request.messages.find((m) => m.role === "system")?.content;
    const nonSystemMessages = request.messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.max_tokens || 4096,
      messages: nonSystemMessages,
      stream: true,
    };
    if (systemMessage) body.system = systemMessage;
    if (request.temperature != null) body.temperature = request.temperature;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw { type: "chat_error", message: `HTTP ${res.status}: ${errBody}`, status: res.status, retryable: res.status >= 500 || res.status === 429 };
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw { type: "stream_error", message: "No response body", retryable: false };
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let id = "";
    let model = request.model;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));
            
            if (data.type === "message_start") {
              id = data.message?.id || id;
              model = data.message?.model || model;
              inputTokens = data.message?.usage?.input_tokens || 0;
            } else if (data.type === "content_block_delta") {
              const delta = data.delta?.text || "";
              yield {
                id,
                model,
                delta,
                finish_reason: null,
              };
            } else if (data.type === "message_delta") {
              outputTokens = data.usage?.output_tokens || outputTokens;
              yield {
                id,
                model,
                delta: "",
                finish_reason: data.delta?.stop_reason || "end_turn",
                input_tokens: inputTokens,
                output_tokens: outputTokens,
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

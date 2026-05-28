import type { ProviderAdapter, ChatRequest, ChatResponse, StreamChunk, DiscoveryResult, AdapterError, DiscoveryModel } from "./types";

export class GeminiAdapter implements ProviderAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async discoverModels(apiKey: string, _baseUrl: string): Promise<DiscoveryResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw { type: "discovery_error", message: `HTTP ${res.status}: ${body}`, status: res.status, retryable: res.status >= 500 || res.status === 429 };
    }
    const data = await res.json();
    const models: DiscoveryModel[] = (data.models || []).map((m: Record<string, unknown>) => ({
      id: (m.name as string || "").replace("models/", ""),
      name: (m.displayName as string) || (m.name as string || "").replace("models/", ""),
      owned_by: "google",
      context_length: m.inputTokenLimit as number | undefined,
    }));
    return { models, raw: JSON.stringify(data).slice(0, 5000) };
  }

  async chatCompletion(apiKey: string, _baseUrl: string, request: ChatRequest): Promise<ChatResponse> {
    const modelId = request.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const contents = this.buildContents(request);
    const systemInstruction = this.buildSystemInstruction(request);

    const body: Record<string, unknown> = {
      contents,
      ...systemInstruction,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens,
      },
    };

    const start = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const latency_ms = Date.now() - start;
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw { type: "chat_error", message: `HTTP ${res.status}: ${errBody}`, status: res.status, retryable: res.status >= 500 || res.status === 429 };
    }
    const data = await res.json();
    const content = (data.candidates?.[0]?.content?.parts || []).map((p: Record<string, unknown>) => p.text).join("");
    return {
      id: `gemini-${Date.now()}`,
      model: modelId,
      content,
      input_tokens: data.usageMetadata?.promptTokenCount || 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata?.totalTokenCount || 0,
      finish_reason: data.candidates?.[0]?.finishReason || "",
      latency_ms,
    };
  }

  async *chatCompletionStream(apiKey: string, _baseUrl: string, request: ChatRequest): AsyncGenerator<StreamChunk> {
    const modelId = request.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const contents = this.buildContents(request);
    const systemInstruction = this.buildSystemInstruction(request);

    const body: Record<string, unknown> = {
      contents,
      ...systemInstruction,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const id = `gemini-${Date.now()}`;

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
            const content = (data.candidates?.[0]?.content?.parts || []).map((p: Record<string, unknown>) => p.text).join("");
            const finishReason = data.candidates?.[0]?.finishReason || null;

            yield {
              id,
              model: modelId,
              delta: content,
              finish_reason: finishReason,
              input_tokens: data.usageMetadata?.promptTokenCount,
              output_tokens: data.usageMetadata?.candidatesTokenCount,
            };
          } catch {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildContents(request: ChatRequest): Array<{ role: string; parts: Array<{ text: string }> }> {
    return request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
  }

  private buildSystemInstruction(request: ChatRequest): Record<string, unknown> {
    const systemMessage = request.messages.find((m) => m.role === "system");
    if (systemMessage) {
      return { systemInstruction: { parts: [{ text: systemMessage.content }] } };
    }
    return {};
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

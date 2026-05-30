import { describe, it, expect } from "vitest";
import { OpenAICompatibleAdapter } from "@/lib/providers/openai-compatible";
import { AnthropicAdapter } from "@/lib/providers/anthropic";
import { GeminiAdapter } from "@/lib/providers/gemini";
import { OpenRouterAdapter } from "@/lib/providers/openrouter";

describe("provider adapters — parseError", () => {
  const adapters = [
    { name: "OpenAICompatible", adapter: new OpenAICompatibleAdapter() },
    { name: "Anthropic", adapter: new AnthropicAdapter() },
    { name: "Gemini", adapter: new GeminiAdapter() },
    { name: "OpenRouter", adapter: new OpenRouterAdapter() },
  ];

  for (const { name, adapter } of adapters) {
    describe(name, () => {
      it("parses an object with status", () => {
        const err = { type: "chat_error", message: "Rate limited", status: 429, retryable: true };
        const result = adapter.parseError(err);
        expect(result.type).toBe("chat_error");
        expect(result.message).toBe("Rate limited");
        expect(result.status).toBe(429);
        expect(result.retryable).toBe(true);
      });

      it("handles unknown errors", () => {
        const result = adapter.parseError("something went wrong");
        expect(result.type).toBe("unknown");
        expect(result.message).toBe("something went wrong");
        expect(result.retryable).toBe(false);
      });

      it("handles null/undefined", () => {
        const resultNull = adapter.parseError(null);
        expect(resultNull.type).toBe("unknown");

        const resultUndef = adapter.parseError(undefined);
        expect(resultUndef.type).toBe("unknown");
      });

      it("defaults retryable to false when not specified", () => {
        const err = { type: "auth_error", message: "Unauthorized", status: 401 };
        const result = adapter.parseError(err);
        expect(result.retryable).toBe(false);
      });
    });
  }
});

describe("provider adapters — estimateTokensFromMessages", () => {
  // Re-import the function from validation
  it("estimates tokens from messages", async () => {
    const { estimateTokensFromMessages } = await import("@/lib/gateway/validation");
    const messages = [
      { role: "user", content: "Hello world" },           // 11 chars + role + overhead
      { role: "assistant", content: "Hi there!" },         // 10 chars + role + overhead
    ];
    const tokens = estimateTokensFromMessages(messages);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(100); // Reasonable upper bound for short messages
  });

  it("returns more tokens for longer messages", async () => {
    const { estimateTokensFromMessages } = await import("@/lib/gateway/validation");
    const short = [{ role: "user" as const, content: "hi" }];
    const long = [{ role: "user" as const, content: "a".repeat(10000) }];
    expect(estimateTokensFromMessages(long)).toBeGreaterThan(estimateTokensFromMessages(short));
  });
});

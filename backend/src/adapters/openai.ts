import { ChatRequest, ChatResponse } from './types.js';

export async function openAICompatibleAdapter(
  request: ChatRequest,
  apiKey: string,
  baseUrl: string
): Promise<ChatResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 2048,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Provider API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    id: data.id || `chatcmpl-${Date.now()}`,
    model: data.model || request.model,
    choices: data.choices?.map((c: any, i: number) => ({
      index: i,
      message: c.message || { role: 'assistant', content: '' },
      finish_reason: c.finish_reason || 'stop',
    })) || [],
    usage: data.usage ? {
      prompt_tokens: data.usage.prompt_tokens || 0,
      completion_tokens: data.usage.completion_tokens || 0,
      total_tokens: data.usage.total_tokens || 0,
    } : undefined,
    created: data.created || Math.floor(Date.now() / 1000),
  };
}

export function extractTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += extractTokens(msg.content);
    total += 4;
  }
  total += 2;
  return total;
}
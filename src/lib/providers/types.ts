
export interface DiscoveryModel {
  id: string;
  name: string;
  owned_by?: string;
  context_length?: number;
}

export interface DiscoveryResult {
  models: DiscoveryModel[];
  raw?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: unknown[];
}

export interface ChatResponse {
  id: string;
  model: string;
  content: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  finish_reason: string;
  latency_ms: number;
}

export interface StreamChunk {
  id: string;
  model: string;
  delta: string;
  finish_reason: string | null;
  input_tokens?: number;
  output_tokens?: number;
}

export interface AdapterError {
  type: string;
  message: string;
  status?: number;
  retryable: boolean;
}

export interface ProviderAdapter {
  discoverModels(apiKey: string, baseUrl: string): Promise<DiscoveryResult>;
  chatCompletion(apiKey: string, baseUrl: string, request: ChatRequest): Promise<ChatResponse>;
  chatCompletionStream?(apiKey: string, baseUrl: string, request: ChatRequest): AsyncGenerator<StreamChunk>;
  parseError(error: unknown): AdapterError;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  created: number;
  response_ms?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context_length: number;
  input_price: number;
  output_price: number;
  capabilities: string[];
}

export interface ProviderAdapter {
  name: string;
  chat(request: ChatRequest, apiKey: string, baseUrl: string): Promise<ChatResponse>;
  listModels?(apiKey: string, baseUrl: string): Promise<string[]>;
}
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatRequest, ChatResponse, AdapterError } from "@/lib/providers/types";
import { getAdapter } from "@/lib/providers";
import { decrypt } from "@/lib/crypto";

export interface FallbackConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
  retryableErrorTypes: string[];
}

export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  retryableErrorTypes: ["timeout", "rate_limit", "server_error", "network_error"],
};

export interface EndpointWithDetails {
  id: string;
  api_key_id: string;
  model_id: string;
  provider_model_id: string;
  is_available: boolean;
  enabled: boolean;
  priority: number;
  health_score: number;
  avg_latency_ms: number | null;
  consecutive_failures: number;
  api_keys: {
    id: string;
    encrypted_key: string;
    base_url: string | null;
    subscription_id: string | null;
    provider_id: string;
    providers: {
      id: string;
      provider_type: string;
      base_url: string;
    };
  };
  models: {
    id: string;
    input_price: number | null;
    output_price: number | null;
  };
}

export interface FallbackAttempt {
  attempt_number: number;
  endpoint_id: string;
  api_key_id: string;
  provider_id: string;
  model_id: string;
  provider_model_id: string;
  error_type?: string;
  error_message?: string;
  http_status?: number;
  latency_ms?: number;
  success: boolean;
}

export interface FallbackResult {
  success: boolean;
  response?: ChatResponse;
  attempts: FallbackAttempt[];
  final_endpoint_id?: string;
  total_latency_ms: number;
}

export class FallbackRouter {
  private supabase: SupabaseClient;
  private config: FallbackConfig;

  constructor(supabase: SupabaseClient, config: FallbackConfig = DEFAULT_FALLBACK_CONFIG) {
    this.supabase = supabase;
    this.config = config;
  }

  async executeWithFallback(
    userId: string,
    request: ChatRequest,
    taskType: string,
    strategy: string,
    preferredEndpointId?: string
  ): Promise<FallbackResult> {
    const startTime = Date.now();
    const attempts: FallbackAttempt[] = [];
    
    const endpoints = await this.getFallbackChain(userId, taskType, strategy, preferredEndpointId);
    
    if (endpoints.length === 0) {
      return {
        success: false,
        attempts: [],
        total_latency_ms: Date.now() - startTime,
      };
    }

    for (let i = 0; i < endpoints.length && i < this.config.maxRetries; i++) {
      const endpoint = endpoints[i];
      const attemptStart = Date.now();
      
      try {
        const result = await this.attemptCall(endpoint, request);
        
        attempts.push({
          attempt_number: i + 1,
          endpoint_id: endpoint.id,
          api_key_id: endpoint.api_key_id,
          provider_id: endpoint.api_keys.providers.id,
          model_id: endpoint.model_id,
          provider_model_id: endpoint.provider_model_id,
          latency_ms: Date.now() - attemptStart,
          success: true,
        });

        return {
          success: true,
          response: result,
          attempts,
          final_endpoint_id: endpoint.id,
          total_latency_ms: Date.now() - startTime,
        };
      } catch (err: unknown) {
        const adapter = getAdapter(endpoint.api_keys.providers.provider_type as "openai_compatible" | "anthropic" | "gemini" | "custom");
        const adapterError = adapter.parseError(err);

        attempts.push({
          attempt_number: i + 1,
          endpoint_id: endpoint.id,
          api_key_id: endpoint.api_key_id,
          provider_id: endpoint.api_keys.providers.id,
          model_id: endpoint.model_id,
          provider_model_id: endpoint.provider_model_id,
          error_type: adapterError.type,
          error_message: adapterError.message,
          http_status: adapterError.status,
          latency_ms: Date.now() - attemptStart,
          success: false,
        });

        if (!this.isRetryable(adapterError)) {
          break;
        }

        if (i < endpoints.length - 1 && i < this.config.maxRetries - 1) {
          const delay = this.calculateDelay(i);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      attempts,
      total_latency_ms: Date.now() - startTime,
    };
  }

  private async getFallbackChain(
    userId: string,
    taskType: string,
    strategy: string,
    preferredEndpointId?: string
  ): Promise<EndpointWithDetails[]> {
    const query = this.supabase
      .from("model_endpoints")
      .select(`
        id,
        api_key_id,
        model_id,
        provider_model_id,
        is_available,
        enabled,
        priority,
        health_score,
        avg_latency_ms,
        consecutive_failures,
        api_keys!inner (
          id,
          encrypted_key,
          base_url,
          subscription_id,
          provider_id,
          providers!inner (
            id,
            provider_type,
            base_url
          )
        ),
        models!inner (
          id,
          input_price,
          output_price
        )
      `)
      .eq("user_id", userId)
      .eq("enabled", true)
      .eq("is_available", true);

    const { data: endpoints, error } = await query;

    if (error || !endpoints) {
      console.error("Failed to fetch endpoints:", error);
      return [];
    }

    let filtered = endpoints.filter((ep: Record<string, unknown>) => {
      const allowed = ep.allowed_tasks as string[] | null;
      const blocked = ep.blocked_tasks as string[] | null;
      if (blocked && blocked.includes(taskType)) return false;
      if (allowed && allowed.length > 0 && !allowed.includes(taskType)) return false;
      return true;
    });

    if (preferredEndpointId) {
      const preferred = filtered.find((ep: Record<string, unknown>) => ep.id === preferredEndpointId);
      if (preferred) {
        filtered = [preferred, ...filtered.filter((ep: Record<string, unknown>) => ep.id !== preferredEndpointId)];
      }
    }

    this.sortEndpoints(filtered, strategy);

    return filtered as unknown as EndpointWithDetails[];
  }

  private sortEndpoints(endpoints: Record<string, unknown>[], strategy: string): void {
    switch (strategy) {
      case "best_quality":
        endpoints.sort((a, b) => ((b.health_score as number) || 0) - ((a.health_score as number) || 0));
        break;
      case "lowest_cost": {
        const getPrice = (ep: Record<string, unknown>) => {
          const models = ep.models as { input_price: number | null; output_price: number | null };
          return (models?.input_price || 0) + (models?.output_price || 0);
        };
        endpoints.sort((a, b) => getPrice(a) - getPrice(b));
        break;
      }
      case "fastest":
        endpoints.sort((a, b) => ((a.avg_latency_ms as number) || 99999) - ((b.avg_latency_ms as number) || 99999));
        break;
      case "most_quota_left":
        endpoints.sort((a, b) => {
          const aLeft = ((a.quota_total as number) || 0) - ((a.quota_used as number) || 0);
          const bLeft = ((b.quota_total as number) || 0) - ((b.quota_used as number) || 0);
          return bLeft - aLeft;
        });
        break;
      case "balanced":
        endpoints.sort((a, b) => {
          const scoreA = ((a.health_score as number) || 0) * 0.4 + ((a.priority as number) || 0) * 0.3 + (100 - (((a.avg_latency_ms as number) || 100) / 100)) * 0.3;
          const scoreB = ((b.health_score as number) || 0) * 0.4 + ((b.priority as number) || 0) * 0.3 + (100 - (((b.avg_latency_ms as number) || 100) / 100)) * 0.3;
          return scoreB - scoreA;
        });
        break;
      default:
        endpoints.sort((a, b) => ((b.priority as number) || 0) - ((a.priority as number) || 0));
    }
  }

  private async attemptCall(
    endpoint: EndpointWithDetails,
    request: ChatRequest
  ): Promise<ChatResponse> {
    const apiKey = endpoint.api_keys;
    const provider = apiKey.providers;

    let plaintextKey: string;
    try {
      plaintextKey = decrypt(apiKey.encrypted_key);
    } catch {
      throw new Error("Failed to decrypt API key");
    }

    const adapter = getAdapter(provider.provider_type as "openai_compatible" | "anthropic" | "gemini" | "custom");
    const baseUrl = apiKey.base_url || provider.base_url;

    return adapter.chatCompletion(plaintextKey, baseUrl, {
      ...request,
      model: endpoint.provider_model_id,
      stream: false,
    });
  }

  private isRetryable(error: AdapterError): boolean {
    if (error.retryable) return true;
    if (error.status && this.config.retryableStatusCodes.includes(error.status)) return true;
    if (this.config.retryableErrorTypes.includes(error.type)) return true;
    return false;
  }

  private calculateDelay(attemptNumber: number): number {
    const delay = this.config.baseDelayMs * Math.pow(2, attemptNumber);
    return Math.min(delay, this.config.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export async function recordFallbackAttempts(
  supabase: SupabaseClient,
  userId: string,
  taskRunId: string,
  attempts: FallbackAttempt[],
  finalEndpointId: string | undefined
): Promise<void> {
  for (const attempt of attempts) {
    await supabase.from("usage_logs").insert({
      user_id: userId,
      task_run_id: taskRunId,
      subscription_id: null,
      api_key_id: attempt.api_key_id,
      model_id: attempt.model_id,
      model_endpoint_id: attempt.endpoint_id,
      provider_id: attempt.provider_id,
      request_type: "chat",
      status: attempt.success ? "success" : "error",
      error_type: attempt.error_type,
      error_message: attempt.error_message,
      http_status: attempt.http_status,
      latency_ms: attempt.latency_ms,
      fallback_attempt: attempt.attempt_number,
    });
  }

  if (finalEndpointId) {
    await supabase
      .from("task_runs")
      .update({ final_endpoint_id: finalEndpointId })
      .eq("id", taskRunId);
  }
}

export async function updateEndpointHealthAfterFallback(
  supabase: SupabaseClient,
  attempts: FallbackAttempt[]
): Promise<void> {
  for (const attempt of attempts) {
    const { data: ep } = await supabase
      .from("model_endpoints")
      .select("success_count, failure_count, consecutive_failures, avg_latency_ms, health_score")
      .eq("id", attempt.endpoint_id)
      .single();

    if (!ep) continue;

    const successCount = (ep.success_count as number) + (attempt.success ? 1 : 0);
    const failureCount = (ep.failure_count as number) + (attempt.success ? 0 : 1);
    const consecutiveFailures = attempt.success ? 0 : (ep.consecutive_failures as number) + 1;
    const totalCalls = successCount + failureCount;
    const healthScore = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100 * 100) / 100 : 100;
    const avgLatencyMs = attempt.latency_ms
      ? Math.round(((ep.avg_latency_ms as number || attempt.latency_ms) * (totalCalls - 1) + attempt.latency_ms) / totalCalls)
      : ep.avg_latency_ms;

    const update: Record<string, unknown> = {
      success_count: successCount,
      failure_count: failureCount,
      consecutive_failures: consecutiveFailures,
      health_score: healthScore,
      avg_latency_ms: avgLatencyMs,
    };

    if (attempt.success) {
      update.last_success_at = new Date().toISOString();
    } else {
      update.last_error_at = new Date().toISOString();
      update.last_error_message = attempt.error_message;
    }

    if (consecutiveFailures >= 5) {
      update.enabled = false;
      update.disabled_at = new Date().toISOString();
    }

    await supabase.from("model_endpoints").update(update).eq("id", attempt.endpoint_id);
  }
}

import type { ProviderType } from "@/types/database";
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
  allowed_tasks: string[] | null;
  blocked_tasks: string[] | null;
  quota_total: number | null;
  quota_used: number | null;
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

    for (let i = 0; i < endpoints.length && i <= this.config.maxRetries; i++) {
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
        const adapter = getAdapter(endpoint.api_keys.providers.provider_type as ProviderType);
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
          // Non-retryable on *this* endpoint (e.g. 401, 403, 404) — but
          // other endpoints may still succeed, so continue the chain.
          continue;
        }

        if (i < endpoints.length - 1 && i < this.config.maxRetries) {
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

  /**
   * Get the ordered fallback chain for external callers (e.g. streaming).
   * Public so the stream route can reuse the same endpoint resolution logic.
   */
  async getFallbackChain(
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
        allowed_tasks,
        blocked_tasks,
        quota_total,
        quota_used,
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

    let filtered = (endpoints as unknown as EndpointWithDetails[]).filter((ep) => {
      const allowed = ep.allowed_tasks;
      const blocked = ep.blocked_tasks;
      if (blocked && blocked.includes(taskType)) return false;
      if (allowed && allowed.length > 0 && !allowed.includes(taskType)) return false;
      return true;
    });

    if (preferredEndpointId) {
      const preferred = filtered.find((ep) => ep.id === preferredEndpointId);
      if (preferred) {
        filtered = [preferred, ...filtered.filter((ep) => ep.id !== preferredEndpointId)];
      }
    }

    this.sortEndpoints(filtered, strategy);

    return filtered;
  }

  private sortEndpoints(endpoints: EndpointWithDetails[], strategy: string): void {
    switch (strategy) {
      case "best_quality":
        endpoints.sort((a, b) => (b.health_score || 0) - (a.health_score || 0));
        break;
      case "lowest_cost":
        endpoints.sort((a, b) => {
          const priceA = (a.models.input_price || 0) + (a.models.output_price || 0);
          const priceB = (b.models.input_price || 0) + (b.models.output_price || 0);
          return priceA - priceB;
        });
        break;
      case "fastest":
        endpoints.sort((a, b) => (a.avg_latency_ms || 99999) - (b.avg_latency_ms || 99999));
        break;
      case "most_quota_left":
        endpoints.sort((a, b) => {
          const aLeft = (a.quota_total || 0) - (a.quota_used || 0);
          const bLeft = (b.quota_total || 0) - (b.quota_used || 0);
          return bLeft - aLeft;
        });
        break;
      case "balanced":
        endpoints.sort((a, b) => {
          const scoreA = (a.health_score || 0) * 0.4 + (a.priority || 0) * 0.3 + (100 - ((a.avg_latency_ms || 100) / 100)) * 0.3;
          const scoreB = (b.health_score || 0) * 0.4 + (b.priority || 0) * 0.3 + (100 - ((b.avg_latency_ms || 100) / 100)) * 0.3;
          return scoreB - scoreA;
        });
        break;
      case "fallback_chain":
      default:
        endpoints.sort((a, b) => (b.priority || 0) - (a.priority || 0));
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

    const adapter = getAdapter(provider.provider_type as ProviderType);
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
  // Batch insert all usage log entries in one call
  if (attempts.length > 0) {
    const rows = attempts.map((attempt) => ({
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
    }));

    await supabase.from("usage_logs").insert(rows);
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
  // Use the atomic RPC for each attempt to avoid SELECT+UPDATE roundtrips
  const updates = attempts.map((attempt) =>
    supabase.rpc("update_endpoint_health", {
      p_endpoint_id: attempt.endpoint_id,
      p_success: attempt.success,
      p_latency_ms: attempt.latency_ms ?? null,
    })
  );

  await Promise.allSettled(updates);
}

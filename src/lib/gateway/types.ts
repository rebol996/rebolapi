/**
 * Typed helpers for Supabase join queries.
 *
 * Supabase's `.select("..., nested_table(col)")` returns `unknown` for nested
 * objects. These types let callers cast once, safely, at the call-site instead
 * of sprinkling `as unknown as ...` everywhere.
 */

/** model_endpoints joined with api_keys and providers */
export interface EndpointWithJoin {
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

/** model_endpoints joined with api_keys only (no nested provider) */
export interface EndpointWithApiKey {
  id: string;
  api_key_id: string;
  model_id: string;
  provider_model_id: string;
  is_available: boolean;
  enabled: boolean;
  priority: number;
  health_score: number;
  avg_latency_ms: number | null;
  allowed_tasks: string[] | null;
  blocked_tasks: string[] | null;
  api_keys: {
    id: string;
    encrypted_key: string;
    base_url: string | null;
    subscription_id: string | null;
    provider_id: string;
  };
}

/** api_keys joined with provider and subscription info */
export interface ApiKeyWithProvider {
  provider_id: string;
  subscription_id: string | null;
}

/** model_endpoints for validation (includes api_keys budget fields) */
export interface EndpointForValidation {
  id: string;
  enabled: boolean;
  is_available: boolean;
  health_score: number;
  quota_total: number | null;
  quota_used: number | null;
  quota_type: string;
  allowed_tasks: string[] | null;
  blocked_tasks: string[] | null;
  consecutive_failures: number;
  api_keys: {
    id: string;
    monthly_budget: number | null;
    single_call_budget: number | null;
    rate_limit_per_minute: number | null;
    last_used_at: string | null;
    subscription_id: string | null;
  };
  models: {
    id: string;
    input_price: number | null;
    output_price: number | null;
  };
}

/** usage_logs joined with providers */
export interface UsageLogWithProvider {
  estimated_cost: number | null;
  latency_ms: number | null;
  provider_id: string;
  providers: {
    id: string;
    name: string;
  } | null;
}

/** usage_logs joined with models */
export interface UsageLogWithModel {
  estimated_cost: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  model_id: string;
  models: {
    id: string;
    display_name: string;
    quality_level: number | null;
    providers: {
      name: string;
    } | null;
  } | null;
}

/** model_endpoints with models and providers for health ranking */
export interface EndpointForHealth {
  id: string;
  health_score: number | null;
  success_count: number | null;
  failure_count: number | null;
  avg_latency_ms: number | null;
  consecutive_failures: number | null;
  models: {
    display_name: string;
    providers: { name: string } | null;
  } | null;
}

/** model_endpoints with api_keys for alert checks */
export interface EndpointForAlerts {
  id: string;
  provider_model_id: string;
  consecutive_failures: number;
  last_error_message: string | null;
  api_keys: { key_alias: string } | null;
}

/** model_endpoints with models for quota/alert display */
export interface EndpointWithModel {
  id: string;
  provider_model_id: string;
  quota_total: number | null;
  quota_used: number | null;
  quota_type: string;
  models: { display_name: string } | null;
}

/** model_endpoints with models for endpoint health alerts */
export interface EndpointHealthAlert {
  id: string;
  provider_model_id: string;
  health_score: number;
  models: { display_name: string } | null;
}

/**
 * Cast a Supabase query result to a typed join object.
 * Usage: `const ep = toTyped<EndpointWithJoin>(rawRow);`
 */
export function toTyped<T>(data: unknown): T {
  return data as T;
}

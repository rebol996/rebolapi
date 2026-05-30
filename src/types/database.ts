export type ProviderType = "openai_compatible" | "anthropic" | "gemini" | "openrouter" | "custom";

export type SubscriptionStatus = "active" | "paused" | "canceled" | "expired" | "trial" | "unknown";
export type QuotaType = "token" | "request" | "credit" | "message" | "hour" | "daily_limit" | "monthly_limit" | "unlimited" | "unknown";
export type BillingCycle = "monthly" | "yearly" | "one_time" | "usage_based" | "unknown";

export type ApiKeyStatus = "active" | "disabled" | "expired" | "revoked";

export type RoutingStrategy = "manual" | "best_quality" | "lowest_cost" | "fastest" | "most_quota_left" | "balanced" | "fallback_chain";

export type TaskType =
  | "chat"
  | "analyze"
  | "review"
  | "plan"
  | "refactor"
  | "bug_diagnosis"
  | "test_generation"
  | "security_review"
  | "performance_analysis"
  | "pr_description"
  | "commit_message"
  | "requirement_breakdown"
  | "architecture_planning"
  | "custom";

export type SavePolicy = "metadata_only" | "summary" | "full";

export type BudgetScope = "global" | "provider" | "subscription" | "api_key" | "model" | "model_endpoint" | "task_type";
export type BudgetPeriod = "daily" | "weekly" | "monthly" | "yearly";

export type AlertType =
  | "subscription_renewal"
  | "low_quota"
  | "budget_warning"
  | "budget_exceeded"
  | "api_key_failure"
  | "model_unavailable"
  | "endpoint_health_low"
  | "cost_spike"
  | "unused_subscription";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved" | "ignored";

export type GatewayTokenStatus = "active" | "revoked";

export type DiscoveryStatus = "success" | "partial" | "failed";

export type UsageLogStatus = "success" | "error" | "timeout" | "rate_limited" | "fallback";
export type TaskRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type QualityLevel = 1 | 2 | 3 | 4 | 5;
export type SpeedLevel = 1 | 2 | 3 | 4 | 5;
export type CostLevel = 1 | 2 | 3 | 4 | 5;

export interface Provider {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  provider_type: ProviderType;
  base_url: string;
  models_endpoint: string;
  chat_endpoint: string;
  auth_type: string;
  default_headers: Record<string, string> | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  platform: string;
  plan_name: string;
  alias: string | null;
  account_label: string | null;
  price: number | null;
  currency: string;
  billing_cycle: BillingCycle;
  renewal_date: string | null;
  auto_renew: boolean;
  status: SubscriptionStatus;
  quota_type: QuotaType;
  quota_total: number | null;
  quota_used: number | null;
  reset_cycle: string | null;
  reset_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  subscription_id: string;
  provider_id: string;
  key_alias: string;
  encrypted_key: string;
  key_preview: string;
  base_url: string | null;
  status: ApiKeyStatus;
  allowed_tasks: string[] | null;
  blocked_tasks: string[] | null;
  monthly_budget: number | null;
  single_call_budget: number | null;
  rate_limit_per_minute: number | null;
  max_parallel_requests: number | null;
  last_used_at: string | null;
  last_checked_at: string | null;
  failure_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Model {
  id: string;
  user_id: string;
  provider_id: string;
  provider_model_id: string;
  display_name: string;
  family: string | null;
  context_length: number | null;
  input_price: number | null;
  output_price: number | null;
  currency: string;
  supports_tools: boolean;
  supports_structured_output: boolean;
  supports_vision: boolean;
  supports_streaming: boolean;
  quality_level: QualityLevel | null;
  speed_level: SpeedLevel | null;
  cost_level: CostLevel | null;
  task_tags: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelEndpoint {
  id: string;
  user_id: string;
  api_key_id: string;
  model_id: string;
  provider_model_id: string;
  is_available: boolean;
  enabled: boolean;
  priority: number;
  quota_type: QuotaType;
  quota_total: number | null;
  quota_used: number | null;
  reset_cycle: string | null;
  reset_date: string | null;
  low_quota_alert: number | null;
  allowed_tasks: string[] | null;
  blocked_tasks: string[] | null;
  success_count: number;
  failure_count: number;
  consecutive_failures: number;
  avg_latency_ms: number | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  health_score: number;
  discovered_at: string | null;
  last_seen_at: string | null;
  disabled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelDiscovery {
  id: string;
  user_id: string;
  api_key_id: string;
  provider_id: string;
  status: DiscoveryStatus;
  discovered_count: number;
  added_count: number;
  updated_count: number;
  unavailable_count: number;
  error_message: string | null;
  raw_response_summary: string | null;
  created_at: string;
}

export interface PromptTemplate {
  id: string;
  user_id: string;
  name: string;
  task_type: TaskType;
  system_prompt: string | null;
  user_prompt_template: string;
  variables: string[] | null;
  default_strategy: RoutingStrategy;
  default_temperature: number | null;
  default_save_policy: SavePolicy;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRun {
  id: string;
  user_id: string;
  task_type: TaskType;
  title: string | null;
  input_summary: string | null;
  strategy: RoutingStrategy;
  status: TaskRunStatus;
  selected_endpoint_id: string | null;
  final_endpoint_id: string | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cost: number | null;
  total_latency_ms: number | null;
  save_policy: SavePolicy;
  rating: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageLog {
  id: string;
  user_id: string;
  task_run_id: string;
  subscription_id: string | null;
  api_key_id: string;
  model_id: string;
  model_endpoint_id: string;
  provider_id: string;
  gateway_token_id: string | null;
  request_type: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  latency_ms: number | null;
  status: UsageLogStatus;
  error_type: string | null;
  error_message: string | null;
  http_status: number | null;
  fallback_attempt: number;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  scope: BudgetScope;
  scope_id: string | null;
  period: BudgetPeriod;
  amount: number;
  currency: string;
  warning_threshold: number | null;
  hard_limit: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: string;
  user_id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  status: AlertStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface GatewayToken {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  scopes: string[];
  rate_limit_per_minute: number | null;
  status: GatewayTokenStatus;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

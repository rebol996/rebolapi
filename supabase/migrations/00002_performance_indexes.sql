-- Performance indexes for common dashboard/API access patterns.
-- Safe to run more than once.

CREATE INDEX IF NOT EXISTS idx_providers_user_created_at
  ON providers(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_created_at
  ON subscriptions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON subscriptions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_created_at
  ON api_keys(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_status
  ON api_keys(user_id, status);

CREATE INDEX IF NOT EXISTS idx_models_user_created_at
  ON models(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_endpoints_user_priority
  ON model_endpoints(user_id, priority DESC);

CREATE INDEX IF NOT EXISTS idx_model_endpoints_user_enabled_available
  ON model_endpoints(user_id, enabled, is_available);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_created_at
  ON prompt_templates(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_budgets_user_created_at
  ON budgets(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_user_created_at
  ON alerts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_user_status_created_at
  ON alerts(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created_at
  ON usage_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gateway_tokens_user_created_at
  ON gateway_tokens(user_id, created_at DESC);

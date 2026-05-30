-- Rebol API Database Schema
-- Initial migration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- providers
-- ============================================
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'openai_compatible' CHECK (provider_type IN ('openai_compatible', 'anthropic', 'gemini', 'openrouter', 'custom')),
  base_url TEXT NOT NULL,
  models_endpoint TEXT NOT NULL DEFAULT '/v1/models',
  chat_endpoint TEXT NOT NULL DEFAULT '/v1/chat/completions',
  auth_type TEXT NOT NULL DEFAULT 'bearer',
  default_headers JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

-- ============================================
-- subscriptions
-- ============================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  alias TEXT,
  account_label TEXT,
  price NUMERIC(10, 2),
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly', 'one_time', 'usage_based', 'unknown')),
  renewal_date DATE,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'canceled', 'expired', 'trial', 'unknown')),
  quota_type TEXT NOT NULL DEFAULT 'unknown' CHECK (quota_type IN ('token', 'request', 'credit', 'message', 'hour', 'daily_limit', 'monthly_limit', 'unlimited', 'unknown')),
  quota_total NUMERIC(20, 2),
  quota_used NUMERIC(20, 2) DEFAULT 0,
  reset_cycle TEXT,
  reset_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- api_keys
-- ============================================
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  key_alias TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  base_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'expired', 'revoked')),
  allowed_tasks JSONB DEFAULT NULL,
  blocked_tasks JSONB DEFAULT NULL,
  monthly_budget NUMERIC(10, 2),
  single_call_budget NUMERIC(10, 2),
  rate_limit_per_minute INTEGER,
  max_parallel_requests INTEGER,
  last_used_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- models
-- ============================================
CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  provider_model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  family TEXT,
  context_length INTEGER,
  input_price NUMERIC(10, 6),
  output_price NUMERIC(10, 6),
  currency TEXT NOT NULL DEFAULT 'USD',
  supports_tools BOOLEAN NOT NULL DEFAULT false,
  supports_structured_output BOOLEAN NOT NULL DEFAULT false,
  supports_vision BOOLEAN NOT NULL DEFAULT false,
  supports_streaming BOOLEAN NOT NULL DEFAULT true,
  quality_level INTEGER CHECK (quality_level BETWEEN 1 AND 5),
  speed_level INTEGER CHECK (speed_level BETWEEN 1 AND 5),
  cost_level INTEGER CHECK (cost_level BETWEEN 1 AND 5),
  task_tags JSONB DEFAULT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider_id, provider_model_id)
);

-- ============================================
-- model_endpoints
-- ============================================
CREATE TABLE model_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  provider_model_id TEXT NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  quota_type TEXT NOT NULL DEFAULT 'unknown' CHECK (quota_type IN ('token', 'request', 'credit', 'message', 'hour', 'daily_limit', 'monthly_limit', 'unlimited', 'unknown')),
  quota_total NUMERIC(20, 2),
  quota_used NUMERIC(20, 2) DEFAULT 0,
  reset_cycle TEXT,
  reset_date DATE,
  low_quota_alert NUMERIC(10, 2),
  allowed_tasks JSONB DEFAULT NULL,
  blocked_tasks JSONB DEFAULT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,
  health_score NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
  discovered_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(api_key_id, model_id)
);

-- ============================================
-- model_discoveries
-- ============================================
CREATE TABLE model_discoveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
  discovered_count INTEGER NOT NULL DEFAULT 0,
  added_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unavailable_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  raw_response_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- prompt_templates
-- ============================================
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'custom',
  system_prompt TEXT,
  user_prompt_template TEXT NOT NULL,
  variables JSONB DEFAULT NULL,
  default_strategy TEXT NOT NULL DEFAULT 'balanced',
  default_temperature NUMERIC(3, 2),
  default_save_policy TEXT NOT NULL DEFAULT 'metadata_only',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- task_runs
-- ============================================
CREATE TABLE task_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL DEFAULT 'chat',
  title TEXT,
  input_summary TEXT,
  strategy TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  selected_endpoint_id UUID REFERENCES model_endpoints(id) ON DELETE SET NULL,
  final_endpoint_id UUID REFERENCES model_endpoints(id) ON DELETE SET NULL,
  total_input_tokens INTEGER,
  total_output_tokens INTEGER,
  total_cost NUMERIC(10, 6),
  total_latency_ms INTEGER,
  save_policy TEXT NOT NULL DEFAULT 'metadata_only',
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- usage_logs
-- ============================================
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_run_id UUID NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  model_endpoint_id UUID NOT NULL REFERENCES model_endpoints(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL DEFAULT 'chat',
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost NUMERIC(10, 6),
  actual_cost NUMERIC(10, 6),
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'timeout', 'rate_limited', 'fallback')),
  error_type TEXT,
  error_message TEXT,
  http_status INTEGER,
  fallback_attempt INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- budgets
-- ============================================
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'provider', 'subscription', 'api_key', 'model', 'model_endpoint', 'task_type')),
  scope_id UUID,
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('daily', 'weekly', 'monthly', 'yearly')),
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  warning_threshold NUMERIC(5, 2),
  hard_limit BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- alerts
-- ============================================
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('subscription_renewal', 'low_quota', 'budget_warning', 'budget_exceeded', 'api_key_failure', 'model_unavailable', 'endpoint_health_low', 'cost_spike', 'unused_subscription')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- ============================================
-- gateway_tokens
-- ============================================
CREATE TABLE gateway_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes JSONB NOT NULL DEFAULT '["chat:write"]',
  rate_limit_per_minute INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_providers_user_id ON providers(user_id);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_provider_id ON api_keys(provider_id);
CREATE INDEX idx_models_user_id ON models(user_id);
CREATE INDEX idx_models_provider_id ON models(provider_id);
CREATE INDEX idx_model_endpoints_user_id ON model_endpoints(user_id);
CREATE INDEX idx_model_endpoints_api_key_id ON model_endpoints(api_key_id);
CREATE INDEX idx_model_endpoints_model_id ON model_endpoints(model_id);
CREATE INDEX idx_model_endpoints_enabled_available ON model_endpoints(enabled, is_available);
CREATE INDEX idx_model_discoveries_api_key_id ON model_discoveries(api_key_id);
CREATE INDEX idx_prompt_templates_user_id ON prompt_templates(user_id);
CREATE INDEX idx_task_runs_user_id ON task_runs(user_id);
CREATE INDEX idx_task_runs_status ON task_runs(status);
CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_task_run_id ON usage_logs(task_run_id);
CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX idx_budgets_user_id ON budgets(user_id);
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_gateway_tokens_user_id ON gateway_tokens(user_id);
CREATE INDEX idx_gateway_tokens_token_hash ON gateway_tokens(token_hash);

-- ============================================
-- Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_providers_updated_at BEFORE UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_models_updated_at BEFORE UPDATE ON models FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_model_endpoints_updated_at BEFORE UPDATE ON model_endpoints FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_prompt_templates_updated_at BEFORE UPDATE ON prompt_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_task_runs_updated_at BEFORE UPDATE ON task_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_budgets_updated_at BEFORE UPDATE ON budgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_tokens ENABLE ROW LEVEL SECURITY;

-- Providers policies
CREATE POLICY "Users can view own providers" ON providers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own providers" ON providers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own providers" ON providers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own providers" ON providers FOR DELETE USING (auth.uid() = user_id);

-- Subscriptions policies
CREATE POLICY "Users can view own subscriptions" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own subscriptions" ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subscriptions" ON subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own subscriptions" ON subscriptions FOR DELETE USING (auth.uid() = user_id);

-- API keys policies
CREATE POLICY "Users can view own api_keys" ON api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own api_keys" ON api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own api_keys" ON api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own api_keys" ON api_keys FOR DELETE USING (auth.uid() = user_id);

-- Models policies
CREATE POLICY "Users can view own models" ON models FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own models" ON models FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own models" ON models FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own models" ON models FOR DELETE USING (auth.uid() = user_id);

-- Model endpoints policies
CREATE POLICY "Users can view own model_endpoints" ON model_endpoints FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own model_endpoints" ON model_endpoints FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own model_endpoints" ON model_endpoints FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own model_endpoints" ON model_endpoints FOR DELETE USING (auth.uid() = user_id);

-- Model discoveries policies
CREATE POLICY "Users can view own model_discoveries" ON model_discoveries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own model_discoveries" ON model_discoveries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own model_discoveries" ON model_discoveries FOR DELETE USING (auth.uid() = user_id);

-- Prompt templates policies
CREATE POLICY "Users can view own prompt_templates" ON prompt_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own prompt_templates" ON prompt_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own prompt_templates" ON prompt_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own prompt_templates" ON prompt_templates FOR DELETE USING (auth.uid() = user_id);

-- Task runs policies
CREATE POLICY "Users can view own task_runs" ON task_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own task_runs" ON task_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own task_runs" ON task_runs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own task_runs" ON task_runs FOR DELETE USING (auth.uid() = user_id);

-- Usage logs policies
CREATE POLICY "Users can view own usage_logs" ON usage_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own usage_logs" ON usage_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own usage_logs" ON usage_logs FOR DELETE USING (auth.uid() = user_id);

-- Budgets policies
CREATE POLICY "Users can view own budgets" ON budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own budgets" ON budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own budgets" ON budgets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own budgets" ON budgets FOR DELETE USING (auth.uid() = user_id);

-- Alerts policies
CREATE POLICY "Users can view own alerts" ON alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own alerts" ON alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own alerts" ON alerts FOR DELETE USING (auth.uid() = user_id);

-- Gateway tokens policies
CREATE POLICY "Users can view own gateway_tokens" ON gateway_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own gateway_tokens" ON gateway_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own gateway_tokens" ON gateway_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own gateway_tokens" ON gateway_tokens FOR DELETE USING (auth.uid() = user_id);

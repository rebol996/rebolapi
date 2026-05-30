-- =============================================================================
-- Rebol API — Migration 002
-- Adds: account_pool_items, account_discovered_models, account_asset_snapshots,
--       gateway_token_id on usage_logs, increment_quota_used RPC,
--       additional composite indexes, missing RLS policies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- account_pool_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_pool_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  platform_type       TEXT NOT NULL DEFAULT 'proxy',
  platform_name       TEXT NOT NULL,
  base_url            TEXT NOT NULL,
  auth_method         TEXT NOT NULL DEFAULT 'api_key',
  encrypted_api_key   TEXT NOT NULL,
  key_preview         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'needs_sync',
  last_sync_at        TIMESTAMPTZ,
  sync_error          TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- account_discovered_models
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_discovered_models (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES account_pool_items(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_model_id   TEXT NOT NULL,
  display_name        TEXT NOT NULL,
  context_length      INTEGER,
  last_seen_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, provider_model_id)
);

-- ---------------------------------------------------------------------------
-- account_asset_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_asset_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES account_pool_items(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_snapshot    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Add gateway_token_id to usage_logs
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usage_logs' AND column_name = 'gateway_token_id'
  ) THEN
    ALTER TABLE usage_logs
      ADD COLUMN gateway_token_id UUID REFERENCES gateway_tokens(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Additional indexes for account pool tables and new columns
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pool_user        ON account_pool_items(user_id);
CREATE INDEX IF NOT EXISTS idx_pool_status       ON account_pool_items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_adm_account       ON account_discovered_models(account_id);
CREATE INDEX IF NOT EXISTS idx_adm_user          ON account_discovered_models(user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_account ON account_asset_snapshots(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_gateway_token ON usage_logs(gateway_token_id, created_at DESC) WHERE gateway_token_id IS NOT NULL;

-- Composite indexes for common query patterns in the gateway
CREATE INDEX IF NOT EXISTS idx_endpoints_available ON model_endpoints(user_id, enabled, is_available);
CREATE INDEX IF NOT EXISTS idx_usage_user_date     ON usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_api_key_date  ON usage_logs(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_user_status  ON alerts(user_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS for account pool tables
-- ---------------------------------------------------------------------------
ALTER TABLE account_pool_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_discovered_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_asset_snapshots   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own account_pool_items"
  ON account_pool_items FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own account_discovered_models"
  ON account_discovered_models FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage own account_asset_snapshots"
  ON account_asset_snapshots FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- updated_at trigger for account_pool_items
CREATE TRIGGER set_account_pool_items_updated_at
  BEFORE UPDATE ON account_pool_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RPC: Atomic quota increment
-- Used by gateway/quota.ts to avoid race conditions in serverless
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_quota_used(p_endpoint_id UUID, p_amount NUMERIC)
RETURNS TABLE (quota_total NUMERIC, quota_used NUMERIC, remaining NUMERIC, low_quota_alert NUMERIC)
LANGUAGE plpgsql
AS $$
DECLARE
  v_total NUMERIC;
  v_used  NUMERIC;
  v_alert NUMERIC;
BEGIN
  UPDATE model_endpoints
    SET quota_used = COALESCE(quota_used, 0) + p_amount,
        updated_at = now()
    WHERE id = p_endpoint_id
    RETURNING quota_total, quota_used, low_quota_alert
    INTO v_total, v_used, v_alert;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Endpoint % not found', p_endpoint_id;
  END IF;

  quota_total     := v_total;
  quota_used      := v_used;
  remaining       := COALESCE(v_total, 0) - v_used;
  low_quota_alert := v_alert;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Atomic endpoint health update
-- Avoids SELECT + UPDATE roundtrip in serverless environments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_endpoint_health(
  p_endpoint_id UUID,
  p_success     BOOLEAN,
  p_latency_ms  INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_success_count       INTEGER;
  v_failure_count       INTEGER;
  v_consecutive         INTEGER;
  v_current_health      NUMERIC;
  v_current_latency     NUMERIC;
  v_total               INTEGER;
  v_new_health          NUMERIC;
  v_new_latency         NUMERIC;
  v_new_consecutive     INTEGER;
  v_now                 TIMESTAMPTZ := now();
  ALPHA CONSTANT NUMERIC := 0.3;
BEGIN
  SELECT success_count, failure_count, consecutive_failures, health_score, avg_latency_ms
    INTO v_success_count, v_failure_count, v_consecutive, v_current_health, v_current_latency
    FROM model_endpoints WHERE id = p_endpoint_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_success_count   := v_success_count + CASE WHEN p_success THEN 1 ELSE 0 END;
  v_failure_count   := v_failure_count + CASE WHEN p_success THEN 0 ELSE 1 END;
  v_new_consecutive := CASE WHEN p_success THEN 0 ELSE v_consecutive + 1 END;
  v_total           := v_success_count + v_failure_count;

  v_new_health := round((ALPHA * CASE WHEN p_success THEN 100 ELSE 0 END + (1 - ALPHA) * COALESCE(v_current_health, 100)) * 100) / 100;

  v_new_latency := CASE
    WHEN p_latency_ms IS NOT NULL THEN
      round((COALESCE(v_current_latency, p_latency_ms) * (v_total - 1) + p_latency_ms) / v_total)
    ELSE v_current_latency
  END;

  UPDATE model_endpoints SET
    success_count       = v_success_count,
    failure_count       = v_failure_count,
    consecutive_failures = v_new_consecutive,
    health_score        = v_new_health,
    avg_latency_ms      = v_new_latency,
    last_success_at     = CASE WHEN p_success THEN v_now ELSE last_success_at END,
    last_error_at       = CASE WHEN p_success THEN last_error_at ELSE v_now END,
    enabled             = CASE WHEN v_new_consecutive >= 5 THEN false ELSE enabled END,
    disabled_at         = CASE WHEN v_new_consecutive >= 5 THEN v_now ELSE disabled_at END,
    updated_at          = v_now
  WHERE id = p_endpoint_id;
END;
$$;

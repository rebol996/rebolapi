-- Account Pool: AI subscription / proxy account manager
-- Phase 1: API Key / OpenAI-compatible proxy accounts

-- ============================================
-- account_pool_items
-- ============================================
CREATE TABLE account_pool_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform_type TEXT NOT NULL DEFAULT 'proxy'
    CHECK (platform_type IN ('official', 'proxy', 'reseller', 'shared', 'api_key_only', 'other')),
  platform_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  auth_method TEXT NOT NULL DEFAULT 'api_key'
    CHECK (auth_method IN ('api_key', 'bearer_token', 'manual')),
  username TEXT,
  encrypted_password TEXT,
  encrypted_api_key TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_sync'
    CHECK (status IN ('active', 'needs_sync', 'syncing', 'sync_failed', 'needs_login', 'invalid', 'expired', 'quota_low', 'disabled')),
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, base_url, key_preview)
);

-- ============================================
-- account_asset_snapshots
-- ============================================
CREATE TABLE account_asset_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES account_pool_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name TEXT,
  balance NUMERIC(12, 4),
  currency TEXT,
  quota_total NUMERIC(20, 2),
  quota_used NUMERIC(20, 2),
  quota_remaining NUMERIC(20, 2),
  quota_type TEXT,
  renewal_date DATE,
  expires_at DATE,
  auto_renew BOOLEAN,
  raw_snapshot JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- account_discovered_models
-- ============================================
CREATE TABLE account_discovered_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES account_pool_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_model_id TEXT NOT NULL,
  display_name TEXT,
  context_length INTEGER,
  supports_chat BOOLEAN DEFAULT true,
  supports_vision BOOLEAN DEFAULT false,
  supports_audio BOOLEAN DEFAULT false,
  supports_tts BOOLEAN DEFAULT false,
  supports_streaming BOOLEAN DEFAULT true,
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  raw_model JSONB,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, provider_model_id)
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_account_pool_items_user_id ON account_pool_items(user_id);
CREATE INDEX idx_account_pool_items_user_status ON account_pool_items(user_id, status);
CREATE INDEX idx_account_pool_items_user_created_at ON account_pool_items(user_id, created_at DESC);
CREATE INDEX idx_account_asset_snapshots_account_id ON account_asset_snapshots(account_id);
CREATE INDEX idx_account_asset_snapshots_user_id ON account_asset_snapshots(user_id);
CREATE INDEX idx_account_discovered_models_account_id ON account_discovered_models(account_id);
CREATE INDEX idx_account_discovered_models_user_id ON account_discovered_models(user_id);

-- ============================================
-- Updated_at triggers
-- ============================================
CREATE TRIGGER set_account_pool_items_updated_at BEFORE UPDATE ON account_pool_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_account_discovered_models_updated_at BEFORE UPDATE ON account_discovered_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE account_pool_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_asset_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_discovered_models ENABLE ROW LEVEL SECURITY;

-- account_pool_items policies
CREATE POLICY "Users can view own account_pool_items" ON account_pool_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own account_pool_items" ON account_pool_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own account_pool_items" ON account_pool_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own account_pool_items" ON account_pool_items FOR DELETE USING (auth.uid() = user_id);

-- account_asset_snapshots policies
CREATE POLICY "Users can view own account_asset_snapshots" ON account_asset_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own account_asset_snapshots" ON account_asset_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own account_asset_snapshots" ON account_asset_snapshots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own account_asset_snapshots" ON account_asset_snapshots FOR DELETE USING (auth.uid() = user_id);

-- account_discovered_models policies
CREATE POLICY "Users can view own account_discovered_models" ON account_discovered_models FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own account_discovered_models" ON account_discovered_models FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own account_discovered_models" ON account_discovered_models FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own account_discovered_models" ON account_discovered_models FOR DELETE USING (auth.uid() = user_id);

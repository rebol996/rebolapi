-- Add subscription asset management fields
-- All new columns have defaults or are nullable, so existing data is preserved.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'other'
    CHECK (source_type IN ('official', 'reseller', 'proxy', 'shared_account', 'one_time', 'other')),
  ADD COLUMN IF NOT EXISTS vendor_url TEXT,
  ADD COLUMN IF NOT EXISTS console_url TEXT,
  ADD COLUMN IF NOT EXISTS purchase_date DATE,
  ADD COLUMN IF NOT EXISTS expires_at DATE,
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_subscriptions_source_type ON subscriptions(source_type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);

-- Fix health_score precision: NUMERIC(3,2) maxes at 9.99, need 100.00
ALTER TABLE model_endpoints ALTER COLUMN health_score TYPE NUMERIC(5, 2);
ALTER TABLE model_endpoints ALTER COLUMN health_score SET DEFAULT 100.00;

-- Add gateway_token_id to usage_logs for tracking which gateway key made the call
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS gateway_token_id UUID REFERENCES gateway_tokens(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_usage_logs_gateway_token_id ON usage_logs(gateway_token_id);

-- Atomic quota increment to avoid race conditions in serverless environment
CREATE OR REPLACE FUNCTION increment_quota_used(
  p_endpoint_id UUID,
  p_amount NUMERIC
)
RETURNS TABLE (
  quota_total NUMERIC,
  quota_used NUMERIC,
  low_quota_alert NUMERIC,
  remaining NUMERIC
) AS $$
DECLARE
  v_quota_total NUMERIC;
  v_quota_used NUMERIC;
  v_low_quota_alert NUMERIC;
BEGIN
  UPDATE model_endpoints
  SET quota_used = COALESCE(quota_used, 0) + p_amount
  WHERE id = p_endpoint_id
  RETURNING quota_total, quota_used, low_quota_alert
  INTO v_quota_total, v_quota_used, v_low_quota_alert;

  RETURN QUERY SELECT v_quota_total, v_quota_used, v_low_quota_alert, COALESCE(v_quota_total, 0) - v_quota_used;
END;
$$ LANGUAGE plpgsql;

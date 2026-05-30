import type { SupabaseClient } from "@supabase/supabase-js";

export interface QuotaInfo {
  endpoint_id: string;
  quota_type: string;
  quota_total: number;
  quota_used: number;
  quota_remaining: number;
  quota_percentage: number;
  reset_cycle: string | null;
  reset_date: string | null;
  low_quota_alert: number | null;
  is_low: boolean;
  is_exceeded: boolean;
}

export interface QuotaUpdateResult {
  success: boolean;
  previous_used: number;
  new_used: number;
  remaining: number;
  is_low: boolean;
  is_exceeded: boolean;
}

export async function getQuotaInfo(
  supabase: SupabaseClient,
  endpointId: string
): Promise<QuotaInfo | null> {
  const { data: endpoint, error } = await supabase
    .from("model_endpoints")
    .select("id, quota_type, quota_total, quota_used, reset_cycle, reset_date, low_quota_alert")
    .eq("id", endpointId)
    .single();

  if (error || !endpoint) return null;

  const quotaTotal = endpoint.quota_total || 0;
  const quotaUsed = endpoint.quota_used || 0;
  const quotaRemaining = quotaTotal - quotaUsed;
  const quotaPercentage = quotaTotal > 0 ? (quotaUsed / quotaTotal) * 100 : 0;
  const isLow = endpoint.low_quota_alert ? quotaRemaining <= endpoint.low_quota_alert : quotaPercentage >= 80;
  const isExceeded = quotaRemaining <= 0;

  return {
    endpoint_id: endpoint.id,
    quota_type: endpoint.quota_type || "unknown",
    quota_total: quotaTotal,
    quota_used: quotaUsed,
    quota_remaining: quotaRemaining,
    quota_percentage: quotaPercentage,
    reset_cycle: endpoint.reset_cycle,
    reset_date: endpoint.reset_date,
    low_quota_alert: endpoint.low_quota_alert,
    is_low: isLow,
    is_exceeded: isExceeded,
  };
}

export async function updateQuotaUsage(
  supabase: SupabaseClient,
  endpointId: string,
  usageAmount: number
): Promise<QuotaUpdateResult> {
  // Use atomic RPC to avoid race conditions in serverless
  const { data, error } = await supabase.rpc("increment_quota_used", {
    p_endpoint_id: endpointId,
    p_amount: usageAmount,
  });

  if (error || !data || data.length === 0) {
    return {
      success: false,
      previous_used: 0,
      new_used: 0,
      remaining: 0,
      is_low: false,
      is_exceeded: false,
    };
  }

  const result = data[0];
  const quotaTotal = result.quota_total || 0;
  const newUsed = result.quota_used || 0;
  const remaining = result.remaining || 0;
  const quotaPercentage = quotaTotal > 0 ? (newUsed / quotaTotal) * 100 : 0;
  const isLow = result.low_quota_alert
    ? remaining <= result.low_quota_alert
    : quotaPercentage >= 80;
  const isExceeded = remaining <= 0;

  return {
    success: true,
    previous_used: newUsed - usageAmount,
    new_used: newUsed,
    remaining,
    is_low: isLow,
    is_exceeded: isExceeded,
  };
}

export async function checkAndResetQuotas(supabase: SupabaseClient, userId: string): Promise<number> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  const { data: endpoints } = await supabase
    .from("model_endpoints")
    .select("id, reset_cycle, reset_date, quota_used")
    .eq("user_id", userId)
    .not("reset_cycle", "is", null)
    .not("quota_total", "is", null);

  if (!endpoints) return 0;

  const endpointIdsToReset: string[] = [];

  for (const endpoint of endpoints) {
    let shouldReset = false;

    switch (endpoint.reset_cycle) {
      case "daily":
        shouldReset = !endpoint.reset_date || endpoint.reset_date < today;
        break;
      case "weekly": {
        const resetDate = endpoint.reset_date ? new Date(endpoint.reset_date) : null;
        const daysSinceReset = resetDate ? Math.floor((now.getTime() - resetDate.getTime()) / (24 * 60 * 60 * 1000)) : 8;
        shouldReset = daysSinceReset >= 7;
        break;
      }
      case "monthly": {
        const resetDate = endpoint.reset_date ? new Date(endpoint.reset_date) : null;
        const isNewMonth = !resetDate || resetDate.getMonth() !== now.getMonth() || resetDate.getFullYear() !== now.getFullYear();
        shouldReset = isNewMonth;
        break;
      }
      case "yearly": {
        const resetDate = endpoint.reset_date ? new Date(endpoint.reset_date) : null;
        const isNewYear = !resetDate || resetDate.getFullYear() !== now.getFullYear();
        shouldReset = isNewYear;
        break;
      }
    }

    if (shouldReset && endpoint.quota_used && endpoint.quota_used > 0) {
      endpointIdsToReset.push(endpoint.id);
    }
  }

  // Batch update all endpoints at once instead of one-by-one
  if (endpointIdsToReset.length > 0) {
    await supabase
      .from("model_endpoints")
      .update({
        quota_used: 0,
        reset_date: today,
      })
      .in("id", endpointIdsToReset);
  }

  return endpointIdsToReset.length;
}

export async function getLowQuotaEndpoints(
  supabase: SupabaseClient,
  userId: string
): Promise<QuotaInfo[]> {
  const { data: endpoints } = await supabase
    .from("model_endpoints")
    .select("id, quota_type, quota_total, quota_used, reset_cycle, reset_date, low_quota_alert")
    .eq("user_id", userId)
    .eq("enabled", true)
    .not("quota_total", "is", null);

  if (!endpoints) return [];

  const lowQuotaEndpoints: QuotaInfo[] = [];

  for (const endpoint of endpoints) {
    const quotaTotal = endpoint.quota_total || 0;
    const quotaUsed = endpoint.quota_used || 0;
    const quotaRemaining = quotaTotal - quotaUsed;
    const quotaPercentage = quotaTotal > 0 ? (quotaUsed / quotaTotal) * 100 : 0;
    const isLow = endpoint.low_quota_alert ? quotaRemaining <= endpoint.low_quota_alert : quotaPercentage >= 80;
    const isExceeded = quotaRemaining <= 0;

    if (isLow || isExceeded) {
      lowQuotaEndpoints.push({
        endpoint_id: endpoint.id,
        quota_type: endpoint.quota_type || "unknown",
        quota_total: quotaTotal,
        quota_used: quotaUsed,
        quota_remaining: quotaRemaining,
        quota_percentage: quotaPercentage,
        reset_cycle: endpoint.reset_cycle,
        reset_date: endpoint.reset_date,
        low_quota_alert: endpoint.low_quota_alert,
        is_low: isLow,
        is_exceeded: isExceeded,
      });
    }
  }

  return lowQuotaEndpoints.sort((a, b) => a.quota_percentage - b.quota_percentage);
}

export async function createQuotaAlerts(
  supabase: SupabaseClient,
  userId: string,
  endpointId: string,
  quotaInfo: QuotaInfo
): Promise<void> {
  if (quotaInfo.is_exceeded) {
    const { data: existing } = await supabase
      .from("alerts")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "low_quota")
      .eq("entity_id", endpointId)
      .eq("status", "open")
      .single();

    if (!existing) {
      await supabase.from("alerts").insert({
        user_id: userId,
        type: "low_quota",
        severity: "critical",
        title: "Quota Exceeded",
        message: `Endpoint quota has been exceeded. ${quotaInfo.quota_remaining} ${quotaInfo.quota_type} remaining.`,
        entity_type: "model_endpoint",
        entity_id: endpointId,
      });
    }
  } else if (quotaInfo.is_low) {
    const { data: existing } = await supabase
      .from("alerts")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "low_quota")
      .eq("entity_id", endpointId)
      .eq("status", "open")
      .single();

    if (!existing) {
      await supabase.from("alerts").insert({
        user_id: userId,
        type: "low_quota",
        severity: "warning",
        title: "Low Quota Warning",
        message: `Endpoint quota is low. ${quotaInfo.quota_remaining} ${quotaInfo.quota_type} remaining (${quotaInfo.quota_percentage.toFixed(1)}% used).`,
        entity_type: "model_endpoint",
        entity_id: endpointId,
      });
    }
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsageLogWithProvider, UsageLogWithModel, EndpointForHealth } from "@/lib/gateway/types";

export interface CostSummary {
  total_cost: number;
  api_usage_cost: number;
  subscription_cost: number;
  call_count: number;
  avg_cost_per_call: number;
  period_start: string;
  period_end: string;
}

export interface CostByProvider {
  provider_id: string;
  provider_name: string;
  total_cost: number;
  call_count: number;
  avg_latency_ms: number;
}

export interface CostByModel {
  model_id: string;
  model_name: string;
  provider_name: string;
  total_cost: number;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  avg_cost_per_call: number;
}

export interface CostBySubscription {
  subscription_id: string;
  platform: string;
  plan_name: string;
  alias: string | null;
  fixed_cost: number;
  usage_cost: number;
  total_cost: number;
  call_count: number;
}

export interface CostByTaskType {
  task_type: string;
  total_cost: number;
  call_count: number;
  avg_cost_per_call: number;
}

export interface CostTrend {
  date: string;
  cost: number;
  call_count: number;
}

export interface EndpointHealth {
  endpoint_id: string;
  model_name: string;
  provider_name: string;
  health_score: number;
  success_rate: number;
  avg_latency_ms: number;
  total_calls: number;
  consecutive_failures: number;
}

export interface UpcomingRenewal {
  subscription_id: string;
  platform: string;
  plan_name: string;
  alias: string | null;
  renewal_date: string;
  price: number | null;
  currency: string;
  days_until: number;
}

export interface ModelUsageRanking {
  model_id: string;
  model_name: string;
  provider_name: string;
  call_count: number;
  total_cost: number;
  avg_rating: number | null;
  quality_level: number | null;
}

export async function getCostSummary(
  supabase: SupabaseClient,
  userId: string,
  period: "daily" | "weekly" | "monthly" | "yearly" = "monthly"
): Promise<CostSummary> {
  const { startDate, endDate } = getPeriodDates(period);

  const { data: usageLogs } = await supabase
    .from("usage_logs")
    .select("estimated_cost, created_at")
    .eq("user_id", userId)
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("price, billing_cycle")
    .eq("user_id", userId)
    .eq("status", "active");

  const apiUsageCost = usageLogs?.reduce((sum: number, log: { estimated_cost: number | null }) => sum + (log.estimated_cost || 0), 0) || 0;
  const callCount = usageLogs?.length || 0;

  let subscriptionCost = 0;
  if (subscriptions) {
    for (const sub of subscriptions) {
      if (sub.price) {
        switch (sub.billing_cycle) {
          case "monthly":
            subscriptionCost += sub.price;
            break;
          case "yearly":
            subscriptionCost += sub.price / 12;
            break;
          case "one_time":
            subscriptionCost += sub.price / 12;
            break;
        }
      }
    }
  }

  return {
    total_cost: apiUsageCost + subscriptionCost,
    api_usage_cost: apiUsageCost,
    subscription_cost: subscriptionCost,
    call_count: callCount,
    avg_cost_per_call: callCount > 0 ? apiUsageCost / callCount : 0,
    period_start: startDate,
    period_end: endDate,
  };
}

export async function getCostByProvider(
  supabase: SupabaseClient,
  userId: string,
  days: number = 30
): Promise<CostByProvider[]> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("usage_logs")
    .select(`
      estimated_cost,
      latency_ms,
      provider_id,
      providers!inner (
        id,
        name
      )
    `)
    .eq("user_id", userId)
    .gte("created_at", startDate);

  if (!data) return [];

  const providerMap = new Map<string, CostByProvider>();

  for (const log of data) {
    const provider = (log as unknown as UsageLogWithProvider).providers;
    if (!provider) continue;

    const existing = providerMap.get(provider.id) || {
      provider_id: provider.id,
      provider_name: provider.name,
      total_cost: 0,
      call_count: 0,
      avg_latency_ms: 0,
    };

    existing.total_cost += log.estimated_cost || 0;
    existing.call_count += 1;
    existing.avg_latency_ms = (existing.avg_latency_ms * (existing.call_count - 1) + (log.latency_ms || 0)) / existing.call_count;

    providerMap.set(provider.id, existing);
  }

  return Array.from(providerMap.values()).sort((a, b) => b.total_cost - a.total_cost);
}

export async function getCostByModel(
  supabase: SupabaseClient,
  userId: string,
  days: number = 30
): Promise<CostByModel[]> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("usage_logs")
    .select(`
      estimated_cost,
      input_tokens,
      output_tokens,
      model_id,
      models!inner (
        id,
        display_name,
        providers (
          name
        )
      )
    `)
    .eq("user_id", userId)
    .gte("created_at", startDate);

  if (!data) return [];

  const modelMap = new Map<string, CostByModel>();

  for (const log of data) {
    const model = (log as unknown as UsageLogWithModel).models;
    if (!model) continue;

    const existing = modelMap.get(model.id) || {
      model_id: model.id,
      model_name: model.display_name,
      provider_name: model.providers?.name || "Unknown",
      total_cost: 0,
      call_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      avg_cost_per_call: 0,
    };

    existing.total_cost += log.estimated_cost || 0;
    existing.call_count += 1;
    existing.input_tokens += log.input_tokens || 0;
    existing.output_tokens += log.output_tokens || 0;
    existing.avg_cost_per_call = existing.total_cost / existing.call_count;

    modelMap.set(model.id, existing);
  }

  return Array.from(modelMap.values()).sort((a, b) => b.total_cost - a.total_cost);
}

export async function getCostBySubscription(
  supabase: SupabaseClient,
  userId: string,
  days: number = 30
): Promise<CostBySubscription[]> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, platform, plan_name, alias, price, billing_cycle")
    .eq("user_id", userId)
    .eq("status", "active");

  const { data: usageLogs } = await supabase
    .from("usage_logs")
    .select("subscription_id, estimated_cost")
    .eq("user_id", userId)
    .gte("created_at", startDate);

  if (!subscriptions) return [];

  const usageBySub = new Map<string, { cost: number; count: number }>();
  if (usageLogs) {
    for (const log of usageLogs) {
      if (log.subscription_id) {
        const existing = usageBySub.get(log.subscription_id) || { cost: 0, count: 0 };
        existing.cost += log.estimated_cost || 0;
        existing.count += 1;
        usageBySub.set(log.subscription_id, existing);
      }
    }
  }

  return subscriptions.map((sub) => {
    const usage = usageBySub.get(sub.id) || { cost: 0, count: 0 };
    let fixedCost = 0;
    if (sub.price) {
      switch (sub.billing_cycle) {
        case "monthly":
          fixedCost = sub.price;
          break;
        case "yearly":
          fixedCost = sub.price / 12;
          break;
        case "one_time":
          fixedCost = sub.price / 12;
          break;
      }
    }

    return {
      subscription_id: sub.id,
      platform: sub.platform,
      plan_name: sub.plan_name,
      alias: sub.alias,
      fixed_cost: fixedCost,
      usage_cost: usage.cost,
      total_cost: fixedCost + usage.cost,
      call_count: usage.count,
    };
  }).sort((a, b) => b.total_cost - a.total_cost);
}

export async function getCostByTaskType(
  supabase: SupabaseClient,
  userId: string,
  days: number = 30
): Promise<CostByTaskType[]> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("usage_logs")
    .select("request_type, estimated_cost")
    .eq("user_id", userId)
    .gte("created_at", startDate);

  if (!data) return [];

  const taskMap = new Map<string, { cost: number; count: number }>();

  for (const log of data) {
    const taskType = log.request_type || "chat";
    const existing = taskMap.get(taskType) || { cost: 0, count: 0 };
    existing.cost += log.estimated_cost || 0;
    existing.count += 1;
    taskMap.set(taskType, existing);
  }

  return Array.from(taskMap.entries()).map(([taskType, stats]) => ({
    task_type: taskType,
    total_cost: stats.cost,
    call_count: stats.count,
    avg_cost_per_call: stats.count > 0 ? stats.cost / stats.count : 0,
  })).sort((a, b) => b.total_cost - a.total_cost);
}

export async function getCostTrend(
  supabase: SupabaseClient,
  userId: string,
  days: number = 30
): Promise<CostTrend[]> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("usage_logs")
    .select("estimated_cost, created_at")
    .eq("user_id", userId)
    .gte("created_at", startDate)
    .order("created_at", { ascending: true });

  if (!data) return [];

  const dailyMap = new Map<string, { cost: number; count: number }>();

  for (const log of data) {
    const date = new Date(log.created_at).toISOString().split("T")[0];
    const existing = dailyMap.get(date) || { cost: 0, count: 0 };
    existing.cost += log.estimated_cost || 0;
    existing.count += 1;
    dailyMap.set(date, existing);
  }

  const trend: CostTrend[] = [];
  const endDate = new Date();
  const startDateTime = new Date(startDate);

  for (let d = new Date(startDateTime); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const stats = dailyMap.get(dateStr) || { cost: 0, count: 0 };
    trend.push({
      date: dateStr,
      cost: stats.cost,
      call_count: stats.count,
    });
  }

  return trend;
}

export async function getEndpointHealthRanking(
  supabase: SupabaseClient,
  userId: string
): Promise<EndpointHealth[]> {
  const { data } = await supabase
    .from("model_endpoints")
    .select(`
      id,
      health_score,
      success_count,
      failure_count,
      avg_latency_ms,
      consecutive_failures,
      models!inner (
        display_name,
        providers (
          name
        )
      )
    `)
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("health_score", { ascending: false })
    .limit(20);

  if (!data) return [];

  return data.map((ep) => {
    const typed = ep as unknown as EndpointForHealth;
    const model = typed.models;
    const totalCalls = (ep.success_count || 0) + (ep.failure_count || 0);
    const successRate = totalCalls > 0 ? ((ep.success_count || 0) / totalCalls) * 100 : 100;

    return {
      endpoint_id: ep.id,
      model_name: model?.display_name || "Unknown",
      provider_name: model?.providers?.name || "Unknown",
      health_score: ep.health_score || 0,
      success_rate: successRate,
      avg_latency_ms: ep.avg_latency_ms || 0,
      total_calls: totalCalls,
      consecutive_failures: ep.consecutive_failures || 0,
    };
  });
}

export async function getUpcomingRenewals(
  supabase: SupabaseClient,
  userId: string,
  days: number = 30
): Promise<UpcomingRenewal[]> {
  const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data } = await supabase
    .from("subscriptions")
    .select("id, platform, plan_name, alias, renewal_date, price, currency")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("renewal_date", "is", null)
    .lte("renewal_date", endDate)
    .order("renewal_date", { ascending: true });

  if (!data) return [];

  const now = new Date();

  return data.map((sub) => {
    const renewalDate = new Date(sub.renewal_date!);
    const daysUntil = Math.ceil((renewalDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    return {
      subscription_id: sub.id,
      platform: sub.platform,
      plan_name: sub.plan_name,
      alias: sub.alias,
      renewal_date: sub.renewal_date!,
      price: sub.price,
      currency: sub.currency || "USD",
      days_until: daysUntil,
    };
  });
}

export async function getModelUsageRanking(
  supabase: SupabaseClient,
  userId: string,
  days: number = 30
): Promise<ModelUsageRanking[]> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("usage_logs")
    .select(`
      estimated_cost,
      model_id,
      models!inner (
        id,
        display_name,
        quality_level,
        providers (
          name
        )
      )
    `)
    .eq("user_id", userId)
    .gte("created_at", startDate);

  if (!data) return [];

  const modelMap = new Map<string, ModelUsageRanking>();

  for (const log of data) {
    const model = (log as unknown as UsageLogWithModel).models;
    if (!model) continue;

    const existing = modelMap.get(model.id) || {
      model_id: model.id,
      model_name: model.display_name,
      provider_name: model.providers?.name || "Unknown",
      call_count: 0,
      total_cost: 0,
      avg_rating: null,
      quality_level: model.quality_level,
    };

    existing.call_count += 1;
    existing.total_cost += log.estimated_cost || 0;

    modelMap.set(model.id, existing);
  }

  return Array.from(modelMap.values()).sort((a, b) => b.call_count - a.call_count);
}

function getPeriodDates(period: "daily" | "weekly" | "monthly" | "yearly"): { startDate: string; endDate: string } {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "daily":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "weekly": {
      const dayOfWeek = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      break;
    }
    case "yearly":
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case "monthly":
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  return {
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
  };
}

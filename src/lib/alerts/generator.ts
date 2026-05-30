import type { SupabaseClient } from "@supabase/supabase-js";
import type { EndpointWithModel, EndpointForAlerts, EndpointHealthAlert } from "@/lib/gateway/types";

export interface AlertRule {
  type: string;
  severity: "info" | "warning" | "critical";
  check: (supabase: SupabaseClient, userId: string) => Promise<AlertData[]>;
}

export interface AlertData {
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  entity_type: string;
  entity_id: string;
}

export const ALERT_RULES: AlertRule[] = [
  {
    type: "subscription_renewal",
    severity: "warning",
    check: checkSubscriptionRenewals,
  },
  {
    type: "low_quota",
    severity: "warning",
    check: checkLowQuotas,
  },
  {
    type: "budget_warning",
    severity: "warning",
    check: checkBudgetWarnings,
  },
  {
    type: "budget_exceeded",
    severity: "critical",
    check: checkBudgetExceeded,
  },
  {
    type: "api_key_failure",
    severity: "warning",
    check: checkApiKeyFailures,
  },
  {
    type: "endpoint_health_low",
    severity: "warning",
    check: checkEndpointHealth,
  },
  {
    type: "unused_subscription",
    severity: "info",
    check: checkUnusedSubscriptions,
  },
];

async function checkSubscriptionRenewals(supabase: SupabaseClient, userId: string): Promise<AlertData[]> {
  const alerts: AlertData[] = [];
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, platform, plan_name, alias, renewal_date, auto_renew, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("renewal_date", "is", null)
    .lte("renewal_date", sevenDaysFromNow.toISOString().split("T")[0]);

  if (subscriptions) {
    for (const sub of subscriptions) {
      const renewalDate = new Date(sub.renewal_date);
      const daysUntilRenewal = Math.ceil((renewalDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const name = sub.alias || sub.platform;

      alerts.push({
        type: "subscription_renewal",
        severity: daysUntilRenewal <= 3 ? "critical" : "warning",
        title: `Subscription Renewal: ${name}`,
        message: `${sub.platform} - ${sub.plan_name} renews in ${daysUntilRenewal} day${daysUntilRenewal !== 1 ? "s" : ""} (${sub.renewal_date})${sub.auto_renew ? "" : " - Auto-renew is OFF"}`,
        entity_type: "subscription",
        entity_id: sub.id,
      });
    }
  }

  return alerts;
}

async function checkLowQuotas(supabase: SupabaseClient, userId: string): Promise<AlertData[]> {
  const alerts: AlertData[] = [];

  const { data: endpoints } = await supabase
    .from("model_endpoints")
    .select("id, provider_model_id, quota_total, quota_used, quota_type, models(display_name)")
    .eq("user_id", userId)
    .eq("enabled", true)
    .not("quota_total", "is", null);

  if (endpoints) {
    for (const ep of endpoints) {
      if (ep.quota_total && ep.quota_used !== null) {
        const remaining = ep.quota_total - ep.quota_used;
        const percentage = (remaining / ep.quota_total) * 100;

        if (percentage < 20) {
          const typed = ep as unknown as EndpointWithModel;
          const modelName = typed.models?.display_name || ep.provider_model_id;
          alerts.push({
            type: "low_quota",
            severity: percentage < 10 ? "critical" : "warning",
            title: `Low Quota: ${modelName}`,
            message: `Only ${remaining} ${ep.quota_type} remaining (${percentage.toFixed(1)}% of ${ep.quota_total})`,
            entity_type: "model_endpoint",
            entity_id: ep.id,
          });
        }
      }
    }
  }

  return alerts;
}

async function checkBudgetWarnings(supabase: SupabaseClient, userId: string): Promise<AlertData[]> {
  const alerts: AlertData[] = [];

  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("warning_threshold", "is", null);

  if (budgets) {
    for (const budget of budgets) {
      const usage = await getBudgetUsage(supabase, userId, budget);
      const percentage = (usage / budget.amount) * 100;

      if (budget.warning_threshold && percentage >= budget.warning_threshold * 100 && percentage < 100) {
        alerts.push({
          type: "budget_warning",
          severity: "warning",
          title: `Budget Warning: ${budget.scope} ${budget.period}`,
          message: `${percentage.toFixed(1)}% of $${budget.amount} budget used ($${usage.toFixed(2)} spent)`,
          entity_type: "budget",
          entity_id: budget.id,
        });
      }
    }
  }

  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, key_alias, monthly_budget")
    .eq("user_id", userId)
    .not("monthly_budget", "is", null);

  if (apiKeys) {
    for (const key of apiKeys) {
      const monthlyUsage = await getMonthlyUsage(supabase, key.id);
      const percentage = (monthlyUsage / key.monthly_budget!) * 100;

      if (percentage >= 80 && percentage < 100) {
        alerts.push({
          type: "budget_warning",
          severity: "warning",
          title: `API Key Budget Warning: ${key.key_alias}`,
          message: `${percentage.toFixed(1)}% of monthly budget used ($${monthlyUsage.toFixed(2)} of $${key.monthly_budget})`,
          entity_type: "api_key",
          entity_id: key.id,
        });
      }
    }
  }

  return alerts;
}

async function checkBudgetExceeded(supabase: SupabaseClient, userId: string): Promise<AlertData[]> {
  const alerts: AlertData[] = [];

  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("hard_limit", true);

  if (budgets) {
    for (const budget of budgets) {
      const usage = await getBudgetUsage(supabase, userId, budget);
      const percentage = (usage / budget.amount) * 100;

      if (percentage >= 100) {
        alerts.push({
          type: "budget_exceeded",
          severity: "critical",
          title: `Budget Exceeded: ${budget.scope} ${budget.period}`,
          message: `Budget of $${budget.amount} has been exceeded by $${(usage - budget.amount).toFixed(2)}`,
          entity_type: "budget",
          entity_id: budget.id,
        });
      }
    }
  }

  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, key_alias, monthly_budget")
    .eq("user_id", userId)
    .not("monthly_budget", "is", null);

  if (apiKeys) {
    for (const key of apiKeys) {
      const monthlyUsage = await getMonthlyUsage(supabase, key.id);
      const percentage = (monthlyUsage / key.monthly_budget!) * 100;

      if (percentage >= 100) {
        alerts.push({
          type: "budget_exceeded",
          severity: "critical",
          title: `API Key Budget Exceeded: ${key.key_alias}`,
          message: `Monthly budget of $${key.monthly_budget} has been exceeded by $${(monthlyUsage - key.monthly_budget!).toFixed(2)}`,
          entity_type: "api_key",
          entity_id: key.id,
        });
      }
    }
  }

  return alerts;
}

async function checkApiKeyFailures(supabase: SupabaseClient, userId: string): Promise<AlertData[]> {
  const alerts: AlertData[] = [];

  const { data: endpoints } = await supabase
    .from("model_endpoints")
    .select("id, provider_model_id, consecutive_failures, last_error_message, api_keys(key_alias)")
    .eq("user_id", userId)
    .eq("enabled", true)
    .gte("consecutive_failures", 3);

  if (endpoints) {
    for (const ep of endpoints) {
      const typed = ep as unknown as EndpointForAlerts;
      const keyAlias = typed.api_keys?.key_alias || "Unknown";
      alerts.push({
        type: "api_key_failure",
        severity: ep.consecutive_failures >= 5 ? "critical" : "warning",
        title: `API Key Failure: ${keyAlias}`,
        message: `${ep.provider_model_id} has ${ep.consecutive_failures} consecutive failures${ep.last_error_message ? `: ${ep.last_error_message}` : ""}`,
        entity_type: "model_endpoint",
        entity_id: ep.id,
      });
    }
  }

  return alerts;
}

async function checkEndpointHealth(supabase: SupabaseClient, userId: string): Promise<AlertData[]> {
  const alerts: AlertData[] = [];

  const { data: endpoints } = await supabase
    .from("model_endpoints")
    .select("id, provider_model_id, health_score, models(display_name)")
    .eq("user_id", userId)
    .eq("enabled", true)
    .lt("health_score", 50);

  if (endpoints) {
    for (const ep of endpoints) {
      const typed = ep as unknown as EndpointHealthAlert;
      const modelName = typed.models?.display_name || ep.provider_model_id;
      alerts.push({
        type: "endpoint_health_low",
        severity: ep.health_score < 25 ? "critical" : "warning",
        title: `Low Health: ${modelName}`,
        message: `Endpoint health score is ${ep.health_score.toFixed(1)}%`,
        entity_type: "model_endpoint",
        entity_id: ep.id,
      });
    }
  }

  return alerts;
}

async function checkUnusedSubscriptions(supabase: SupabaseClient, userId: string): Promise<AlertData[]> {
  const alerts: AlertData[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, platform, plan_name, alias, price")
    .eq("user_id", userId)
    .eq("status", "active");

  if (!subscriptions || subscriptions.length === 0) return alerts;

  // Batch query: get all subscription_ids that have recent usage
  const subIds = subscriptions.map((s) => s.id);
  const { data: recentUsage } = await supabase
    .from("usage_logs")
    .select("subscription_id")
    .eq("user_id", userId)
    .in("subscription_id", subIds)
    .gte("created_at", thirtyDaysAgo);

  const usedSubIds = new Set((recentUsage || []).map((r) => r.subscription_id));

  for (const sub of subscriptions) {
    if (!usedSubIds.has(sub.id)) {
      const name = sub.alias || sub.platform;
      alerts.push({
        type: "unused_subscription",
        severity: "info",
        title: `Unused Subscription: ${name}`,
        message: `${sub.platform} - ${sub.plan_name} has not been used in 30 days${sub.price ? ` ($${sub.price}/month)` : ""}`,
        entity_type: "subscription",
        entity_id: sub.id,
      });
    }
  }

  return alerts;
}

async function getBudgetUsage(supabase: SupabaseClient, userId: string, budget: { scope: string; scope_id: string | null; period: string }): Promise<number> {
  const now = new Date();
  let startDate: string;

  switch (budget.period) {
    case "daily":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      break;
    case "weekly": {
      const dayOfWeek = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).toISOString();
      break;
    }
    case "monthly":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      break;
    case "yearly":
      startDate = new Date(now.getFullYear(), 0, 1).toISOString();
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }

  let query = supabase
    .from("usage_logs")
    .select("estimated_cost")
    .eq("user_id", userId)
    .gte("created_at", startDate);

  if (budget.scope === "provider" && budget.scope_id) {
    query = query.eq("provider_id", budget.scope_id);
  } else if (budget.scope === "subscription" && budget.scope_id) {
    query = query.eq("subscription_id", budget.scope_id);
  } else if (budget.scope === "api_key" && budget.scope_id) {
    query = query.eq("api_key_id", budget.scope_id);
  } else if (budget.scope === "model" && budget.scope_id) {
    query = query.eq("model_id", budget.scope_id);
  } else if (budget.scope === "model_endpoint" && budget.scope_id) {
    query = query.eq("model_endpoint_id", budget.scope_id);
  }

  const { data } = await query;
  if (!data) return 0;
  return data.reduce((sum: number, log: { estimated_cost: number | null }) => sum + (log.estimated_cost || 0), 0);
}

async function getMonthlyUsage(supabase: SupabaseClient, apiKeyId: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data } = await supabase
    .from("usage_logs")
    .select("estimated_cost")
    .eq("api_key_id", apiKeyId)
    .gte("created_at", startOfMonth);

  if (!data) return 0;
  return data.reduce((sum: number, log: { estimated_cost: number | null }) => sum + (log.estimated_cost || 0), 0);
}

export async function generateAlerts(supabase: SupabaseClient, userId: string): Promise<AlertData[]> {
  const results = await Promise.allSettled(
    ALERT_RULES.map((rule) => rule.check(supabase, userId))
  );

  const allAlerts: AlertData[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allAlerts.push(...result.value);
    } else {
      console.error("Error checking alert rule:", result.reason);
    }
  }

  return allAlerts;
}

export async function createAlertsIfNotExist(
  supabase: SupabaseClient,
  userId: string,
  alerts: AlertData[]
): Promise<number> {
  let created = 0;

  for (const alert of alerts) {
    const { data: existing } = await supabase
      .from("alerts")
      .select("id")
      .eq("user_id", userId)
      .eq("type", alert.type)
      .eq("entity_id", alert.entity_id)
      .eq("status", "open")
      .single();

    if (!existing) {
      const { error } = await supabase.from("alerts").insert({
        user_id: userId,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        entity_type: alert.entity_type,
        entity_id: alert.entity_id,
      });

      if (!error) {
        created++;
      }
    }
  }

  return created;
}

import type { SupabaseClient } from "@supabase/supabase-js";

export interface BudgetCheckResult {
  allowed: boolean;
  warnings: BudgetWarning[];
  limits: BudgetLimit[];
}

export interface BudgetWarning {
  scope: string;
  period: string;
  message: string;
  current_usage: number;
  budget_amount: number;
  percentage: number;
}

export interface BudgetLimit {
  scope: string;
  period: string;
  message: string;
  current_usage: number;
  budget_amount: number;
  exceeded_by: number;
}

export interface BudgetData {
  id: string;
  scope: string;
  scope_id: string | null;
  period: string;
  amount: number;
  currency: string;
  warning_threshold: number | null;
  hard_limit: boolean;
  status: string;
}

export async function checkBudgetBeforeCall(
  supabase: SupabaseClient,
  userId: string,
  apiKeyId: string,
  estimatedCost: number
): Promise<BudgetCheckResult> {
  const warnings: BudgetWarning[] = [];
  const limits: BudgetLimit[] = [];

  const { data: apiKey } = await supabase
    .from("api_keys")
    .select("monthly_budget, single_call_budget")
    .eq("id", apiKeyId)
    .single();

  if (apiKey) {
    if (apiKey.single_call_budget && estimatedCost > apiKey.single_call_budget) {
      limits.push({
        scope: "api_key",
        period: "single_call",
        message: `Estimated cost ($${estimatedCost.toFixed(6)}) exceeds single call budget ($${apiKey.single_call_budget})`,
        current_usage: estimatedCost,
        budget_amount: apiKey.single_call_budget,
        exceeded_by: estimatedCost - apiKey.single_call_budget,
      });
    }

    if (apiKey.monthly_budget) {
      const monthlyUsage = await getMonthlyUsageForBudget(supabase, apiKeyId);
      const remaining = apiKey.monthly_budget - monthlyUsage;
      
      if (remaining <= 0) {
        limits.push({
          scope: "api_key",
          period: "monthly",
          message: `Monthly budget exceeded: $${monthlyUsage.toFixed(2)} used of $${apiKey.monthly_budget}`,
          current_usage: monthlyUsage,
          budget_amount: apiKey.monthly_budget,
          exceeded_by: -remaining,
        });
      } else if (remaining < apiKey.monthly_budget * 0.2) {
        warnings.push({
          scope: "api_key",
          period: "monthly",
          message: `Monthly budget low: $${remaining.toFixed(2)} remaining`,
          current_usage: monthlyUsage,
          budget_amount: apiKey.monthly_budget,
          percentage: (monthlyUsage / apiKey.monthly_budget) * 100,
        });
      }
    }
  }

  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");

  if (budgets) {
    for (const budget of budgets as unknown as BudgetData[]) {
      const usage = await getBudgetUsageForScope(supabase, userId, budget);
      const remaining = budget.amount - usage;
      const percentage = (usage / budget.amount) * 100;

      if (remaining <= 0 && budget.hard_limit) {
        limits.push({
          scope: budget.scope,
          period: budget.period,
          message: `${budget.scope} ${budget.period} budget exceeded: $${usage.toFixed(2)} of $${budget.amount}`,
          current_usage: usage,
          budget_amount: budget.amount,
          exceeded_by: -remaining,
        });
      } else if (budget.warning_threshold && percentage >= budget.warning_threshold * 100) {
        warnings.push({
          scope: budget.scope,
          period: budget.period,
          message: `${budget.scope} ${budget.period} budget warning: ${percentage.toFixed(1)}% used`,
          current_usage: usage,
          budget_amount: budget.amount,
          percentage,
        });
      }
    }
  }

  return {
    allowed: limits.length === 0,
    warnings,
    limits,
  };
}

export async function recordBudgetUsage(
  supabase: SupabaseClient,
  userId: string,
  apiKeyId: string,
  _cost: number,
  _providerId?: string,
  _modelId?: string
): Promise<void> {
  const alertsToCreate: Array<{
    user_id: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    entity_type: string;
    entity_id: string;
  }> = [];

  const { data: apiKey } = await supabase
    .from("api_keys")
    .select("monthly_budget, subscription_id")
    .eq("id", apiKeyId)
    .single();

  if (apiKey?.monthly_budget) {
    const monthlyUsage = await getMonthlyUsageForBudget(supabase, apiKeyId);
    const percentage = (monthlyUsage / apiKey.monthly_budget) * 100;

    if (percentage >= 100) {
      alertsToCreate.push({
        user_id: userId,
        type: "budget_exceeded",
        severity: "critical",
        title: "API Key Monthly Budget Exceeded",
        message: `API key has exceeded its monthly budget of $${apiKey.monthly_budget}. Current usage: $${monthlyUsage.toFixed(2)}`,
        entity_type: "api_key",
        entity_id: apiKeyId,
      });
    } else if (percentage >= 80) {
      alertsToCreate.push({
        user_id: userId,
        type: "budget_warning",
        severity: "warning",
        title: "API Key Monthly Budget Warning",
        message: `API key has used ${percentage.toFixed(1)}% of its monthly budget ($${monthlyUsage.toFixed(2)} of $${apiKey.monthly_budget})`,
        entity_type: "api_key",
        entity_id: apiKeyId,
      });
    }
  }

  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");

  if (budgets) {
    for (const budget of budgets as unknown as BudgetData[]) {
      const usage = await getBudgetUsageForScope(supabase, userId, budget);
      const percentage = (usage / budget.amount) * 100;

      if (percentage >= 100 && budget.hard_limit) {
        alertsToCreate.push({
          user_id: userId,
          type: "budget_exceeded",
          severity: "critical",
          title: `${budget.scope} Budget Exceeded`,
          message: `${budget.scope} ${budget.period} budget of $${budget.amount} has been exceeded. Current usage: $${usage.toFixed(2)}`,
          entity_type: "budget",
          entity_id: budget.id,
        });
      } else if (budget.warning_threshold && percentage >= budget.warning_threshold * 100) {
        alertsToCreate.push({
          user_id: userId,
          type: "budget_warning",
          severity: "warning",
          title: `${budget.scope} Budget Warning`,
          message: `${budget.scope} ${budget.period} budget is at ${percentage.toFixed(1)}% ($${usage.toFixed(2)} of $${budget.amount})`,
          entity_type: "budget",
          entity_id: budget.id,
        });
      }
    }
  }

  for (const alert of alertsToCreate) {
    const { data: existing } = await supabase
      .from("alerts")
      .select("id")
      .eq("user_id", userId)
      .eq("type", alert.type)
      .eq("entity_id", alert.entity_id)
      .eq("status", "open")
      .single();

    if (!existing) {
      await supabase.from("alerts").insert(alert);
    }
  }
}

async function getMonthlyUsageForBudget(supabase: SupabaseClient, apiKeyId: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  
  const { data } = await supabase
    .from("usage_logs")
    .select("estimated_cost")
    .eq("api_key_id", apiKeyId)
    .gte("created_at", startOfMonth);

  if (!data) return 0;
  return data.reduce((sum: number, log: Record<string, unknown>) => sum + ((log.estimated_cost as number) || 0), 0);
}

async function getBudgetUsageForScope(
  supabase: SupabaseClient,
  userId: string,
  budget: BudgetData
): Promise<number> {
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
  return data.reduce((sum: number, log: Record<string, unknown>) => sum + ((log.estimated_cost as number) || 0), 0);
}

export function formatBudgetAmount(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

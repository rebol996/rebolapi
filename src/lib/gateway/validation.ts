import type { SupabaseClient } from "@supabase/supabase-js";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  estimated_cost?: number;
  estimated_tokens?: number;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  value?: unknown;
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  value?: unknown;
}

export interface EndpointValidationData {
  id: string;
  enabled: boolean;
  is_available: boolean;
  health_score: number;
  quota_total: number | null;
  quota_used: number | null;
  quota_type: string;
  allowed_tasks: string[] | null;
  blocked_tasks: string[] | null;
  consecutive_failures: number;
  api_keys: {
    id: string;
    monthly_budget: number | null;
    single_call_budget: number | null;
    rate_limit_per_minute: number | null;
    last_used_at: string | null;
    subscription_id: string | null;
  };
  models: {
    id: string;
    input_price: number | null;
    output_price: number | null;
  };
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
}

export interface RateLimitState {
  count: number;
  reset_at: number;
}

const rateLimitStore = new Map<string, RateLimitState>();

export async function validateEndpoint(
  supabase: SupabaseClient,
  userId: string,
  endpointId: string,
  taskType: string,
  estimatedInputTokens: number = 0
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const { data: endpoint, error: fetchError } = await supabase
    .from("model_endpoints")
    .select(`
      id,
      enabled,
      is_available,
      health_score,
      quota_total,
      quota_used,
      quota_type,
      allowed_tasks,
      blocked_tasks,
      consecutive_failures,
      api_keys!inner (
        id,
        monthly_budget,
        single_call_budget,
        rate_limit_per_minute,
        last_used_at,
        subscription_id
      ),
      models!inner (
        id,
        input_price,
        output_price
      )
    `)
    .eq("id", endpointId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !endpoint) {
    errors.push({
      code: "ENDPOINT_NOT_FOUND",
      message: "Endpoint not found or access denied",
    });
    return { valid: false, errors, warnings };
  }

  const ep = endpoint as unknown as EndpointValidationData;

  if (!ep.enabled) {
    errors.push({
      code: "ENDPOINT_DISABLED",
      message: "Endpoint is disabled",
    });
  }

  if (!ep.is_available) {
    errors.push({
      code: "ENDPOINT_UNAVAILABLE",
      message: "Endpoint is not available",
    });
  }

  const HEALTH_THRESHOLD = 50;
  if (ep.health_score < HEALTH_THRESHOLD) {
    warnings.push({
      code: "LOW_HEALTH_SCORE",
      message: `Endpoint health score is low: ${ep.health_score}`,
      field: "health_score",
      value: ep.health_score,
    });
  }

  if (ep.consecutive_failures >= 3) {
    warnings.push({
      code: "CONSECUTIVE_FAILURES",
      message: `Endpoint has ${ep.consecutive_failures} consecutive failures`,
      field: "consecutive_failures",
      value: ep.consecutive_failures,
    });
  }

  if (ep.blocked_tasks && ep.blocked_tasks.includes(taskType)) {
    errors.push({
      code: "TASK_BLOCKED",
      message: `Task type "${taskType}" is blocked for this endpoint`,
      field: "blocked_tasks",
      value: taskType,
    });
  }

  if (ep.allowed_tasks && ep.allowed_tasks.length > 0 && !ep.allowed_tasks.includes(taskType)) {
    errors.push({
      code: "TASK_NOT_ALLOWED",
      message: `Task type "${taskType}" is not in allowed tasks list`,
      field: "allowed_tasks",
      value: taskType,
    });
  }

  if (ep.quota_total !== null && ep.quota_used !== null) {
    const remaining = ep.quota_total - ep.quota_used;
    if (remaining <= 0) {
      errors.push({
        code: "QUOTA_EXCEEDED",
        message: "Quota has been exceeded",
        field: "quota_remaining",
        value: 0,
      });
    } else {
      const QUOTA_WARNING_THRESHOLD = 0.2;
      if (remaining / ep.quota_total < QUOTA_WARNING_THRESHOLD) {
        warnings.push({
          code: "LOW_QUOTA",
          message: `Quota is low: ${remaining} remaining out of ${ep.quota_total}`,
          field: "quota_remaining",
          value: remaining,
        });
      }
    }
  }

  const apiKey = ep.api_keys;
  
  if (apiKey.rate_limit_per_minute) {
    const rateLimitKey = `${apiKey.id}:${Math.floor(Date.now() / 60000)}`;
    const state = rateLimitStore.get(rateLimitKey);
    
    if (state && state.count >= apiKey.rate_limit_per_minute) {
      errors.push({
        code: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit exceeded: ${apiKey.rate_limit_per_minute} requests per minute`,
        field: "rate_limit_per_minute",
        value: apiKey.rate_limit_per_minute,
      });
    } else {
      warnings.push({
        code: "RATE_LIMIT_WARNING",
        message: `Rate limit: ${state?.count || 0}/${apiKey.rate_limit_per_minute} requests used this minute`,
        field: "rate_limit_per_minute",
        value: { used: state?.count || 0, limit: apiKey.rate_limit_per_minute },
      });
    }
  }

  const estimatedCost = estimateCost(
    estimatedInputTokens,
    ep.models.input_price || 0,
    ep.models.output_price || 0
  );

  if (apiKey.single_call_budget && estimatedCost > apiKey.single_call_budget) {
    errors.push({
      code: "SINGLE_CALL_BUDGET_EXCEEDED",
      message: `Estimated cost ($${estimatedCost.toFixed(6)}) exceeds single call budget ($${apiKey.single_call_budget})`,
      field: "single_call_budget",
      value: { estimated: estimatedCost, budget: apiKey.single_call_budget },
    });
  }

  if (apiKey.monthly_budget) {
    const monthlyUsage = await getMonthlyUsage(supabase, apiKey.id);
    const remaining = apiKey.monthly_budget - monthlyUsage;
    
    if (remaining <= 0) {
      errors.push({
        code: "MONTHLY_BUDGET_EXCEEDED",
        message: "Monthly budget has been exceeded",
        field: "monthly_budget",
        value: { used: monthlyUsage, budget: apiKey.monthly_budget },
      });
    } else if (remaining < apiKey.monthly_budget * 0.2) {
      warnings.push({
        code: "LOW_MONTHLY_BUDGET",
        message: `Monthly budget is low: $${remaining.toFixed(2)} remaining`,
        field: "monthly_budget",
        value: { used: monthlyUsage, budget: apiKey.monthly_budget },
      });
    }
  }

  const globalBudgets = await getGlobalBudgets(supabase, userId);
  for (const budget of globalBudgets) {
    const usage = await getBudgetUsage(supabase, userId, budget);
    const remaining = budget.amount - usage;
    
    if (remaining <= 0 && budget.hard_limit) {
      errors.push({
        code: "GLOBAL_BUDGET_EXCEEDED",
        message: `Global ${budget.period} budget exceeded ($${budget.amount})`,
        field: "budget",
        value: { scope: budget.scope, period: budget.period, used: usage, budget: budget.amount },
      });
    } else if (budget.warning_threshold && remaining / budget.amount < budget.warning_threshold) {
      warnings.push({
        code: "GLOBAL_BUDGET_WARNING",
        message: `Global ${budget.period} budget warning: $${remaining.toFixed(2)} remaining`,
        field: "budget",
        value: { scope: budget.scope, period: budget.period, used: usage, budget: budget.amount },
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimated_cost: estimatedCost,
    estimated_tokens: estimatedInputTokens,
  };
}

function estimateCost(inputTokens: number, inputPrice: number, outputPrice: number): number {
  const estimatedOutputTokens = Math.round(inputTokens * 0.5);
  return (inputTokens / 1000000) * inputPrice + (estimatedOutputTokens / 1000000) * outputPrice;
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
  return data.reduce((sum: number, log: Record<string, unknown>) => sum + ((log.estimated_cost as number) || 0), 0);
}

async function getGlobalBudgets(supabase: SupabaseClient, userId: string): Promise<BudgetData[]> {
  const { data } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("scope", ["global"]);

  return (data || []) as unknown as BudgetData[];
}

async function getBudgetUsage(supabase: SupabaseClient, userId: string, budget: BudgetData): Promise<number> {
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

  const { data } = await supabase
    .from("usage_logs")
    .select("estimated_cost")
    .eq("user_id", userId)
    .gte("created_at", startDate);

  if (!data) return 0;
  return data.reduce((sum: number, log: Record<string, unknown>) => sum + ((log.estimated_cost as number) || 0), 0);
}

export function incrementRateLimit(apiKeyId: string, _limit: number): void {
  const now = Date.now();
  const minuteKey = Math.floor(now / 60000);
  const key = `${apiKeyId}:${minuteKey}`;
  
  const state = rateLimitStore.get(key);
  if (state) {
    state.count++;
  } else {
    rateLimitStore.set(key, { count: 1, reset_at: (minuteKey + 1) * 60000 });
  }

  for (const [k, v] of rateLimitStore.entries()) {
    if (v.reset_at < now) {
      rateLimitStore.delete(k);
    }
  }
}

export function estimateTokensFromMessages(messages: Array<{ role: string; content: string }>): number {
  let totalChars = 0;
  for (const msg of messages) {
    totalChars += msg.content.length + msg.role.length + 10;
  }
  return Math.ceil(totalChars / 4);
}

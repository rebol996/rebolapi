import type { SupabaseClient } from "@supabase/supabase-js";
import type { EndpointForValidation } from "./types";

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

  const ep = endpoint as unknown as EndpointForValidation;

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

  // Rate limit note: in serverless environments, per-minute rate limiting via
  // in-memory stores is unreliable. Budget limits via usage_logs are the primary
  // control mechanism. Keep the configured value as a warning for awareness.
  if (apiKey.rate_limit_per_minute) {
    warnings.push({
      code: "RATE_LIMIT_NOTE",
      message: `Rate limit configured: ${apiKey.rate_limit_per_minute} req/min (best-effort in serverless)`,
      field: "rate_limit_per_minute",
      value: apiKey.rate_limit_per_minute,
    });
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

export function estimateTokensFromMessages(messages: Array<{ role: string; content: string }>): number {
  let totalChars = 0;
  for (const msg of messages) {
    totalChars += msg.content.length + msg.role.length + 10;
  }
  return Math.ceil(totalChars / 4);
}

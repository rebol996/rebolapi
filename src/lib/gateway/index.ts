export { FallbackRouter, recordFallbackAttempts, updateEndpointHealthAfterFallback } from "./fallback";
export type { FallbackConfig, FallbackAttempt, FallbackResult, EndpointWithDetails } from "./fallback";

export { validateEndpoint, incrementRateLimit, estimateTokensFromMessages } from "./validation";
export type { ValidationResult, ValidationError, ValidationWarning } from "./validation";

export { checkBudgetBeforeCall, recordBudgetUsage, formatBudgetAmount } from "./budget";
export type { BudgetCheckResult, BudgetWarning, BudgetLimit } from "./budget";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FallbackRouter, recordFallbackAttempts, updateEndpointHealthAfterFallback } from "./fallback";
import { validateEndpoint, incrementRateLimit, estimateTokensFromMessages } from "./validation";
import { checkBudgetBeforeCall, recordBudgetUsage } from "./budget";

export interface GatewayRequest {
  messages: Array<{ role: string; content: string }>;
  model_endpoint_id?: string;
  strategy?: string;
  task_type?: string;
  temperature?: number;
  max_tokens?: number;
  scan_sensitive?: boolean;
  save_policy?: string;
}

export interface GatewayResponse {
  success: boolean;
  data?: {
    id: string;
    model: string;
    content: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost: number;
    latency_ms: number;
    task_run_id: string;
    endpoint_id: string;
  };
  error?: string;
  error_type?: string;
  validation_errors?: Array<{ code: string; message: string }>;
  validation_warnings?: Array<{ code: string; message: string }>;
  budget_warnings?: Array<{ scope: string; period: string; message: string }>;
  fallback_attempts?: Array<{
    attempt_number: number;
    endpoint_id: string;
    error_type?: string;
    error_message?: string;
    success: boolean;
  }>;
  task_run_id?: string;
}

export async function executeGatewayCall(
  supabase: SupabaseClient,
  userId: string,
  request: GatewayRequest
): Promise<GatewayResponse> {
  const {
    messages,
    model_endpoint_id,
    strategy = "manual",
    task_type = "chat",
    temperature,
    max_tokens,
    save_policy = "metadata_only",
  } = request;

  if (!messages || messages.length === 0) {
    return { success: false, error: "Messages are required" };
  }

  const { data: taskRun, error: taskError } = await supabase
    .from("task_runs")
    .insert({
      user_id: userId,
      task_type,
      input_summary: messages.map((m) => m.content).join(" ").slice(0, 200),
      strategy,
      status: "running",
      selected_endpoint_id: model_endpoint_id || null,
      save_policy,
    })
    .select("id")
    .single();

  if (taskError || !taskRun) {
    return { success: false, error: "Failed to create task run" };
  }

  const estimatedTokens = estimateTokensFromMessages(messages);

  if (model_endpoint_id) {
    const validation = await validateEndpoint(supabase, userId, model_endpoint_id, task_type, estimatedTokens);
    
    if (!validation.valid) {
      await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRun.id);
      return {
        success: false,
        error: "Validation failed",
        validation_errors: validation.errors,
        task_run_id: taskRun.id,
      };
    }

    if (validation.warnings.length > 0) {
      console.warn("Validation warnings:", validation.warnings);
    }
  }

  const budgetCheck = await checkBudgetBeforeCall(
    supabase,
    userId,
    model_endpoint_id || "",
    estimatedTokens * 0.00001
  );

  if (!budgetCheck.allowed) {
    await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRun.id);
    return {
      success: false,
      error: "Budget limits exceeded",
      validation_errors: budgetCheck.limits.map((l) => ({
        code: "BUDGET_EXCEEDED",
        message: l.message,
      })),
      task_run_id: taskRun.id,
    };
  }

  const fallbackRouter = new FallbackRouter(supabase);
  const chatRequest = {
    model: "",
    messages: messages.map((m) => ({ role: m.role as "system" | "user" | "assistant" | "tool", content: m.content })),
    temperature,
    max_tokens,
    stream: false,
  };

  const fallbackResult = await fallbackRouter.executeWithFallback(
    userId,
    chatRequest,
    task_type,
    strategy,
    model_endpoint_id
  );

  if (!fallbackResult.success || !fallbackResult.response) {
    await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRun.id);
    await recordFallbackAttempts(supabase, userId, taskRun.id, fallbackResult.attempts, undefined);
    await updateEndpointHealthAfterFallback(supabase, fallbackResult.attempts);

    return {
      success: false,
      error: "All endpoints failed",
      fallback_attempts: fallbackResult.attempts.map((a) => ({
        attempt_number: a.attempt_number,
        endpoint_id: a.endpoint_id,
        error_type: a.error_type,
        error_message: a.error_message,
        success: a.success,
      })),
      task_run_id: taskRun.id,
    };
  }

  const result = fallbackResult.response;
  const finalEndpointId = fallbackResult.final_endpoint_id!;

  const { data: endpoint } = await supabase
    .from("model_endpoints")
    .select("model_id, api_key_id, api_keys!inner(provider_id, subscription_id)")
    .eq("id", finalEndpointId)
    .single();

  const modelPrices = await getModelPrices(supabase, userId, endpoint?.model_id || "");
  const cost = (result.input_tokens / 1000000) * modelPrices.input + (result.output_tokens / 1000000) * modelPrices.output;

  const apiKeyData = endpoint?.api_keys as unknown as { provider_id: string; subscription_id: string } | undefined;

  await supabase.from("usage_logs").insert({
    user_id: userId,
    task_run_id: taskRun.id,
    subscription_id: apiKeyData?.subscription_id || null,
    api_key_id: endpoint?.api_key_id || "",
    model_id: endpoint?.model_id || "",
    model_endpoint_id: finalEndpointId,
    provider_id: apiKeyData?.provider_id || "",
    request_type: task_type,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    total_tokens: result.total_tokens,
    estimated_cost: cost,
    latency_ms: result.latency_ms,
    status: "success",
    http_status: 200,
    fallback_attempt: fallbackResult.attempts.length,
  });

  await supabase.from("task_runs").update({
    status: "completed",
    final_endpoint_id: finalEndpointId,
    total_input_tokens: result.input_tokens,
    total_output_tokens: result.output_tokens,
    total_cost: cost,
    total_latency_ms: result.latency_ms,
  }).eq("id", taskRun.id);

  await updateEndpointHealthAfterFallback(supabase, fallbackResult.attempts);

  if (endpoint?.api_key_id) {
    await supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", endpoint.api_key_id);

    if (model_endpoint_id) {
      incrementRateLimit(endpoint.api_key_id, 60);
    }
  }

  await recordBudgetUsage(
    supabase,
    userId,
    endpoint?.api_key_id || "",
    cost,
    apiKeyData?.provider_id,
    endpoint?.model_id
  );

  return {
    success: true,
    data: {
      id: result.id,
      model: result.model,
      content: result.content,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      total_tokens: result.total_tokens,
      cost,
      latency_ms: result.latency_ms,
      task_run_id: taskRun.id,
      endpoint_id: finalEndpointId,
    },
    budget_warnings: budgetCheck.warnings.map((w) => ({
      scope: w.scope,
      period: w.period,
      message: w.message,
    })),
    fallback_attempts: fallbackResult.attempts.map((a) => ({
      attempt_number: a.attempt_number,
      endpoint_id: a.endpoint_id,
      error_type: a.error_type,
      error_message: a.error_message,
      success: a.success,
    })),
    task_run_id: taskRun.id,
  };
}

async function getModelPrices(
  supabase: SupabaseClient,
  userId: string,
  modelId: string
): Promise<{ input: number; output: number }> {
  const { data: model } = await supabase
    .from("models")
    .select("input_price, output_price")
    .eq("id", modelId)
    .eq("user_id", userId)
    .single();

  return {
    input: model?.input_price || 0,
    output: model?.output_price || 0,
  };
}

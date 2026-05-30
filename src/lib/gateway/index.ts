export { FallbackRouter, recordFallbackAttempts, updateEndpointHealthAfterFallback } from "./fallback";
export type { FallbackConfig, FallbackAttempt, FallbackResult, EndpointWithDetails } from "./fallback";

export { validateEndpoint, estimateTokensFromMessages } from "./validation";
export type { ValidationResult, ValidationError, ValidationWarning } from "./validation";

export { checkBudgetBeforeCall, recordBudgetUsage, formatBudgetAmount } from "./budget";
export type { BudgetCheckResult, BudgetWarning, BudgetLimit } from "./budget";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FallbackRouter, recordFallbackAttempts, updateEndpointHealthAfterFallback } from "./fallback";
import { validateEndpoint, estimateTokensFromMessages } from "./validation";
import { checkBudgetBeforeCall, recordBudgetUsage } from "./budget";
import { scanForSensitiveInfo, redactSensitiveInfo } from "@/lib/sensitive-scanner";
import { getModelPrices, calculateCost } from "./helpers";

export interface GatewayRequest {
  messages: Array<{ role: string; content: string }>;
  model_endpoint_id?: string;
  strategy?: string;
  task_type?: string;
  temperature?: number;
  max_tokens?: number;
  scan_sensitive?: boolean;
  save_policy?: string;
  gateway_token_id?: string;
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
    gateway_token_id,
  } = request;

  if (!messages || messages.length === 0) {
    return { success: false, error: "Messages are required" };
  }

  let taskRunId: string | undefined;

  try {
    // Sanitize input_summary to prevent sensitive data persistence
    const rawSummary = messages.map((m) => m.content).join(" ").slice(0, 200);
    const summaryScan = scanForSensitiveInfo(rawSummary);
    const inputSummary = summaryScan.found ? redactSensitiveInfo(rawSummary, summaryScan.patterns) : rawSummary;

    const { data: taskRun, error: taskError } = await supabase
      .from("task_runs")
      .insert({
        user_id: userId,
        task_type,
        input_summary: inputSummary,
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

    taskRunId = taskRun.id;

    const estimatedTokens = estimateTokensFromMessages(messages);

    if (model_endpoint_id) {
      const validation = await validateEndpoint(supabase, userId, model_endpoint_id, task_type, estimatedTokens);

      if (!validation.valid) {
        await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRunId);
        return {
          success: false,
          error: "Validation failed",
          validation_errors: validation.errors,
          task_run_id: taskRunId,
        };
      }

      if (validation.warnings.length > 0) {
        console.warn("Validation warnings:", validation.warnings);
      }
    }

    // Only check budget when an endpoint is specified
    let budgetCheck: { allowed: boolean; warnings: Array<{ scope: string; period: string; message: string }>; limits: Array<{ scope: string; period: string; message: string; current_usage: number; budget_amount: number; exceeded_by: number }> } = { allowed: true, warnings: [], limits: [] };

    if (model_endpoint_id) {
      const { data: endpointForBudget } = await supabase
        .from("model_endpoints")
        .select("api_key_id")
        .eq("id", model_endpoint_id)
        .single();

      if (endpointForBudget?.api_key_id) {
        budgetCheck = await checkBudgetBeforeCall(
          supabase,
          userId,
          endpointForBudget.api_key_id,
          estimatedTokens * 0.00001
        );
      }
    }

    if (!budgetCheck.allowed) {
      await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRunId);
      return {
        success: false,
        error: "Budget limits exceeded",
        validation_errors: budgetCheck.limits.map((l) => ({
          code: "BUDGET_EXCEEDED",
          message: l.message,
        })),
        task_run_id: taskRunId,
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
      await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRunId);
      await recordFallbackAttempts(supabase, userId, taskRunId!, fallbackResult.attempts, undefined);
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
        task_run_id: taskRunId,
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
    const cost = calculateCost(result.input_tokens, result.output_tokens, modelPrices);

    const apiKeyData = endpoint?.api_keys as unknown as { provider_id: string; subscription_id: string } | undefined;

    await supabase.from("usage_logs").insert({
      user_id: userId,
      task_run_id: taskRunId,
      subscription_id: apiKeyData?.subscription_id || null,
      api_key_id: endpoint?.api_key_id || "",
      model_id: endpoint?.model_id || "",
      model_endpoint_id: finalEndpointId,
      provider_id: apiKeyData?.provider_id || "",
      gateway_token_id: gateway_token_id || null,
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
    }).eq("id", taskRunId);

    await updateEndpointHealthAfterFallback(supabase, fallbackResult.attempts);

    if (endpoint?.api_key_id) {
      await supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", endpoint.api_key_id);
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
        task_run_id: taskRunId!,
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
      task_run_id: taskRunId,
    };
  } catch (err) {
    console.error("[Gateway] Unexpected error:", err);
    // Best-effort: mark task run as failed if it was created
    if (taskRunId) {
      try { await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRunId); } catch {}
    }
    const message = err instanceof Error ? err.message : "Internal gateway error";
    return { success: false, error: message, task_run_id: taskRunId };
  }
}

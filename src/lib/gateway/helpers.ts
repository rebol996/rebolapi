/**
 * Shared helpers used by both the non-streaming gateway (executeGatewayCall)
 * and the streaming route (/api/chat/stream).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { scanForSensitiveInfo, redactSensitiveInfo } from "@/lib/sensitive-scanner";
import { estimateTokensFromMessages, validateEndpoint } from "./validation";
import { checkBudgetBeforeCall, recordBudgetUsage } from "./budget";
import type { ChatMessage } from "@/lib/providers/types";
import { decrypt } from "@/lib/crypto";

// ---------------------------------------------------------------------------
// Model pricing
// ---------------------------------------------------------------------------

export async function getModelPrices(
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

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  prices: { input: number; output: number }
): number {
  return (inputTokens / 1_000_000) * prices.input + (outputTokens / 1_000_000) * prices.output;
}

// ---------------------------------------------------------------------------
// Pre-flight checks: sensitive scan → task run → validation → budget
// ---------------------------------------------------------------------------

export interface PreflightResult {
  ok: true;
  taskRunId: string;
}

export interface PreflightError {
  ok: false;
  status: number;
  body: Record<string, unknown>;
}

export async function runPreflightChecks(
  supabase: SupabaseClient,
  userId: string,
  messages: ChatMessage[],
  options: {
    task_type: string;
    strategy: string;
    model_endpoint_id?: string;
    save_policy: string;
    scan_sensitive: boolean;
  }
): Promise<PreflightResult | PreflightError> {
  const { task_type, strategy, model_endpoint_id, save_policy, scan_sensitive } = options;

  // 1. Sensitive info scan
  if (scan_sensitive) {
    let hasSensitive = false;
    for (const m of messages) {
      if (scanForSensitiveInfo(m.content).found) { hasSensitive = true; break; }
    }
    if (hasSensitive) {
      return {
        ok: false,
        status: 400,
        body: { error: "Sensitive information detected. Set scan_sensitive=false to override." },
      };
    }
  }

  // 2. Sanitize summary
  const rawSummary = messages.map((m) => m.content).join(" ").slice(0, 200);
  const summaryScan = scanForSensitiveInfo(rawSummary);
  const inputSummary = summaryScan.found ? redactSensitiveInfo(rawSummary, summaryScan.patterns) : rawSummary;

  // 3. Create task run
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
    return { ok: false, status: 500, body: { error: "Failed to create task run" } };
  }

  // 4. Endpoint validation
  const estimatedTokens = estimateTokensFromMessages(messages);

  if (model_endpoint_id) {
    const validation = await validateEndpoint(supabase, userId, model_endpoint_id, task_type, estimatedTokens);
    if (!validation.valid) {
      await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRun.id);
      return {
        ok: false,
        status: 400,
        body: { error: "Validation failed", validation_errors: validation.errors, task_run_id: taskRun.id },
      };
    }
  }

  // 5. Budget check
  if (model_endpoint_id) {
    const { data: endpointForBudget } = await supabase
      .from("model_endpoints")
      .select("api_key_id")
      .eq("id", model_endpoint_id)
      .single();

    if (endpointForBudget?.api_key_id) {
      const budgetCheck = await checkBudgetBeforeCall(
        supabase, userId, endpointForBudget.api_key_id, estimatedTokens * 0.00001
      );
      if (!budgetCheck.allowed) {
        await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRun.id);
        return {
          ok: false,
          status: 402,
          body: {
            error: "Budget limits exceeded",
            validation_errors: budgetCheck.limits.map((l) => ({ code: "BUDGET_EXCEEDED", message: l.message })),
            task_run_id: taskRun.id,
          },
        };
      }
    }
  }

  return { ok: true, taskRunId: taskRun.id };
}

// ---------------------------------------------------------------------------
// Post-call bookkeeping: usage log + task run + health + budget
// ---------------------------------------------------------------------------

export async function recordCallSuccess(
  supabase: SupabaseClient,
  userId: string,
  params: {
    taskRunId: string;
    taskType: string;
    endpointId: string;
    apiKeyId: string;
    modelId: string;
    providerId: string;
    subscriptionId: string | null;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    latencyMs: number;
    fallbackAttempt: number;
  }
): Promise<void> {
  const {
    taskRunId, taskType, endpointId, apiKeyId, modelId, providerId,
    subscriptionId, inputTokens, outputTokens, cost, latencyMs, fallbackAttempt,
  } = params;

  const now = new Date().toISOString();

  // Usage log
  await supabase.from("usage_logs").insert({
    user_id: userId,
    task_run_id: taskRunId,
    subscription_id: subscriptionId,
    api_key_id: apiKeyId,
    model_id: modelId,
    model_endpoint_id: endpointId,
    provider_id: providerId,
    request_type: taskType,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    estimated_cost: cost,
    latency_ms: latencyMs,
    status: "success",
    http_status: 200,
    fallback_attempt: fallbackAttempt,
  });

  // Task run
  await supabase.from("task_runs").update({
    status: "completed",
    final_endpoint_id: endpointId,
    total_input_tokens: inputTokens,
    total_output_tokens: outputTokens,
    total_cost: cost,
    total_latency_ms: latencyMs,
  }).eq("id", taskRunId);

  // Health update via atomic RPC
  await supabase.rpc("update_endpoint_health", {
    p_endpoint_id: endpointId,
    p_success: true,
    p_latency_ms: latencyMs,
  });

  // API key last used
  await supabase.from("api_keys").update({ last_used_at: now }).eq("id", apiKeyId);

  // Budget recording
  await recordBudgetUsage(supabase, userId, apiKeyId, cost, providerId, modelId);
}

// ---------------------------------------------------------------------------
// Resolve endpoint → decrypt key → get adapter + provider info
// ---------------------------------------------------------------------------

export interface ResolvedEndpoint {
  plaintextKey: string;
  baseUrl: string;
  providerType: string;
  providerId: string;
  subscriptionId: string | null;
  apiKeyId: string;
  modelId: string;
  providerModelId: string;
}

export async function resolveEndpoint(
  supabase: SupabaseClient,
  endpointId: string
): Promise<ResolvedEndpoint | null> {
  const { data: endpoint } = await supabase
    .from("model_endpoints")
    .select(`
      id, api_key_id, model_id, provider_model_id,
      api_keys!inner (
        id, encrypted_key, base_url, subscription_id, provider_id,
        providers!inner (id, provider_type, base_url)
      )
    `)
    .eq("id", endpointId)
    .single();

  if (!endpoint) return null;

  const apiKey = endpoint.api_keys as unknown as {
    id: string;
    encrypted_key: string;
    base_url: string | null;
    subscription_id: string | null;
    provider_id: string;
    providers: { id: string; provider_type: string; base_url: string };
  };

  let plaintextKey: string;
  try {
    plaintextKey = decrypt(apiKey.encrypted_key);
  } catch {
    return null;
  }

  return {
    plaintextKey,
    baseUrl: apiKey.base_url || apiKey.providers.base_url,
    providerType: apiKey.providers.provider_type,
    providerId: apiKey.providers.id,
    subscriptionId: apiKey.subscription_id,
    apiKeyId: apiKey.id,
    modelId: endpoint.model_id as string,
    providerModelId: endpoint.provider_model_id as string,
  };
}

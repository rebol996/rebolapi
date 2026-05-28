import { createClient } from "@/lib/supabase/server";
import { scanForSensitiveInfo } from "@/lib/sensitive-scanner";
import { validateEndpoint, estimateTokensFromMessages, incrementRateLimit } from "@/lib/gateway/validation";
import { checkBudgetBeforeCall, recordBudgetUsage } from "@/lib/gateway/budget";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/providers";
import type { ChatMessage } from "@/lib/providers/types";

interface StreamRequestBody {
  messages: ChatMessage[];
  model_endpoint_id?: string;
  strategy?: string;
  task_type?: string;
  temperature?: number;
  max_tokens?: number;
  scan_sensitive?: boolean;
  save_policy?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body: StreamRequestBody = await request.json();
  const {
    messages,
    model_endpoint_id,
    strategy = "manual",
    task_type = "chat",
    temperature,
    max_tokens,
    scan_sensitive = true,
    save_policy = "metadata_only",
  } = body;

  if (!messages || messages.length === 0) {
    return new Response(JSON.stringify({ error: "Messages are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (scan_sensitive) {
    const fullText = messages.map((m) => m.content).join(" ");
    const scanResult = scanForSensitiveInfo(fullText);
    if (scanResult.found) {
      return new Response(JSON.stringify({
        error: "Sensitive information detected",
        sensitive_scan: scanResult.patterns.map((p) => ({ type: p.type, position: p.start })),
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const { data: taskRun, error: taskError } = await supabase
    .from("task_runs")
    .insert({
      user_id: user.id,
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
    return new Response(JSON.stringify({ error: "Failed to create task run" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const estimatedTokens = estimateTokensFromMessages(messages);

  if (model_endpoint_id) {
    const validation = await validateEndpoint(supabase, user.id, model_endpoint_id, task_type, estimatedTokens);
    if (!validation.valid) {
      await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRun.id);
      return new Response(JSON.stringify({
        error: "Validation failed",
        validation_errors: validation.errors,
        task_run_id: taskRun.id,
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const budgetCheck = await checkBudgetBeforeCall(
    supabase,
    user.id,
    model_endpoint_id || "",
    estimatedTokens * 0.00001
  );

  if (!budgetCheck.allowed) {
    await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRun.id);
    return new Response(JSON.stringify({
      error: "Budget limits exceeded",
      validation_errors: budgetCheck.limits.map((l) => ({
        code: "BUDGET_EXCEEDED",
        message: l.message,
      })),
      task_run_id: taskRun.id,
    }), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      sendEvent({ type: "start", task_run_id: taskRun.id });

      try {
        const endpoints = await getEndpointsForStream(supabase, user.id, task_type, strategy, model_endpoint_id);
        
        if (endpoints.length === 0) {
          sendEvent({ type: "error", error: "No available endpoints" });
          await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRun.id);
          controller.close();
          return;
        }

        let success = false;
        const attempts = [];

        for (let i = 0; i < endpoints.length && i < 3; i++) {
          const endpoint = endpoints[i];
          const attemptStart = Date.now();

          try {
            const apiKeyData = endpoint.api_keys as unknown as {
              id: string;
              encrypted_key: string;
              base_url: string | null;
              provider_id: string;
              subscription_id: string | null;
            };
            const providerData = apiKeyData.provider_id ? await getProvider(supabase, apiKeyData.provider_id) : null;

            if (!apiKeyData || !providerData) {
              throw new Error("API key or provider not found");
            }

            let plaintextKey: string;
            try {
              plaintextKey = decrypt(apiKeyData.encrypted_key);
            } catch {
              throw new Error("Failed to decrypt API key");
            }

            const adapter = getAdapter(providerData.provider_type as "openai_compatible" | "anthropic" | "gemini" | "custom");
            const baseUrl = apiKeyData.base_url || providerData.base_url;

            if (!adapter.chatCompletionStream) {
              throw new Error("Stream not supported for this provider");
            }

            const chatRequest = {
              model: endpoint.provider_model_id as string,
              messages,
              temperature,
              max_tokens,
              stream: true,
            };

            let inputTokens = 0;
            let outputTokens = 0;

            for await (const chunk of adapter.chatCompletionStream(plaintextKey, baseUrl, chatRequest)) {
              sendEvent({
                type: "delta",
                content: chunk.delta,
                model: chunk.model,
              });

              if (chunk.input_tokens) inputTokens = chunk.input_tokens;
              if (chunk.output_tokens) outputTokens = chunk.output_tokens;

              if (chunk.finish_reason) {
                const modelPrices = await getModelPrices(supabase, user.id, endpoint.model_id as string);
                const cost = (inputTokens / 1000000) * modelPrices.input + (outputTokens / 1000000) * modelPrices.output;

                await supabase.from("usage_logs").insert({
                  user_id: user.id,
                  task_run_id: taskRun.id,
                  subscription_id: apiKeyData.subscription_id,
                  api_key_id: apiKeyData.id,
                  model_id: endpoint.model_id,
                  model_endpoint_id: endpoint.id,
                  provider_id: providerData.id,
                  request_type: task_type,
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                  total_tokens: inputTokens + outputTokens,
                  estimated_cost: cost,
                  latency_ms: Date.now() - attemptStart,
                  status: "success",
                  http_status: 200,
                  fallback_attempt: i,
                });

                await supabase.from("task_runs").update({
                  status: "completed",
                  final_endpoint_id: endpoint.id,
                  total_input_tokens: inputTokens,
                  total_output_tokens: outputTokens,
                  total_cost: cost,
                  total_latency_ms: Date.now() - attemptStart,
                }).eq("id", taskRun.id);

                await updateEndpointHealth(supabase, endpoint.id as string, true, Date.now() - attemptStart);

                await supabase
                  .from("api_keys")
                  .update({ last_used_at: new Date().toISOString() })
                  .eq("id", apiKeyData.id);

                if (model_endpoint_id) {
                  incrementRateLimit(apiKeyData.id, 60);
                }

                await recordBudgetUsage(supabase, user.id, apiKeyData.id, cost, providerData.id, endpoint.model_id as string);

                sendEvent({
                  type: "end",
                  finish_reason: chunk.finish_reason,
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                  cost,
                  latency_ms: Date.now() - attemptStart,
                  endpoint_id: endpoint.id,
                });

                success = true;
                break;
              }
            }

            if (success) break;
          } catch (err: unknown) {
            const error = err as Error;
            attempts.push({
              attempt_number: i + 1,
              endpoint_id: endpoint.id,
              error_type: "stream_error",
              error_message: error.message,
              latency_ms: Date.now() - attemptStart,
              success: false,
            });

            await updateEndpointHealth(supabase, endpoint.id as string, false);

            if (i === endpoints.length - 1 || i === 2) {
              sendEvent({
                type: "error",
                error: error.message,
                fallback_attempts: attempts,
              });
            }
          }
        }

        if (!success) {
          await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRun.id);
        }
      } catch (err: unknown) {
        const error = err as Error;
        sendEvent({ type: "error", error: error.message });
        await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRun.id);
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function getEndpointsForStream(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  taskType: string,
  strategy: string,
  preferredEndpointId?: string
) {
  const query = supabase
    .from("model_endpoints")
    .select(`
      id,
      api_key_id,
      model_id,
      provider_model_id,
      is_available,
      enabled,
      priority,
      health_score,
      avg_latency_ms,
      api_keys!inner (
        id,
        encrypted_key,
        base_url,
        subscription_id,
        provider_id
      )
    `)
    .eq("user_id", userId)
    .eq("enabled", true)
    .eq("is_available", true);

  const { data: endpoints } = await query;

  if (!endpoints || endpoints.length === 0) return [];

  let filtered = endpoints.filter((ep: Record<string, unknown>) => {
    const allowed = ep.allowed_tasks as string[] | null;
    const blocked = ep.blocked_tasks as string[] | null;
    if (blocked && blocked.includes(taskType)) return false;
    if (allowed && allowed.length > 0 && !allowed.includes(taskType)) return false;
    return true;
  });

  if (preferredEndpointId) {
    const preferred = filtered.find((ep: Record<string, unknown>) => ep.id === preferredEndpointId);
    if (preferred) {
      filtered = [preferred, ...filtered.filter((ep: Record<string, unknown>) => ep.id !== preferredEndpointId)];
    }
  }

  switch (strategy) {
    case "best_quality":
      filtered.sort((a, b) => ((b.health_score as number) || 0) - ((a.health_score as number) || 0));
      break;
    case "fastest":
      filtered.sort((a, b) => ((a.avg_latency_ms as number) || 99999) - ((b.avg_latency_ms as number) || 99999));
      break;
    case "balanced":
      filtered.sort((a, b) => {
        const scoreA = ((a.health_score as number) || 0) * 0.5 + (100 - (((a.avg_latency_ms as number) || 100) / 100)) * 0.5;
        const scoreB = ((b.health_score as number) || 0) * 0.5 + (100 - (((b.avg_latency_ms as number) || 100) / 100)) * 0.5;
        return scoreB - scoreA;
      });
      break;
    default:
      filtered.sort((a, b) => ((b.priority as number) || 0) - ((a.priority as number) || 0));
  }

  return filtered;
}

async function getProvider(supabase: Awaited<ReturnType<typeof createClient>>, providerId: string) {
  const { data } = await supabase
    .from("providers")
    .select("id, provider_type, base_url")
    .eq("id", providerId)
    .single();
  return data;
}

async function getModelPrices(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

async function updateEndpointHealth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  endpointId: string,
  success: boolean,
  latencyMs?: number
): Promise<void> {
  const { data: ep } = await supabase
    .from("model_endpoints")
    .select("success_count, failure_count, consecutive_failures, avg_latency_ms, health_score")
    .eq("id", endpointId)
    .single();

  if (!ep) return;

  const successCount = (ep.success_count as number) + (success ? 1 : 0);
  const failureCount = (ep.failure_count as number) + (success ? 0 : 1);
  const consecutiveFailures = success ? 0 : (ep.consecutive_failures as number) + 1;
  const totalCalls = successCount + failureCount;
  const healthScore = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100 * 100) / 100 : 100;
  const avgLatencyMs = latencyMs
    ? Math.round(((ep.avg_latency_ms as number || latencyMs) * (totalCalls - 1) + latencyMs) / totalCalls)
    : ep.avg_latency_ms;

  const update: Record<string, unknown> = {
    success_count: successCount,
    failure_count: failureCount,
    consecutive_failures: consecutiveFailures,
    health_score: healthScore,
    avg_latency_ms: avgLatencyMs,
  };

  if (success) {
    update.last_success_at = new Date().toISOString();
  } else {
    update.last_error_at = new Date().toISOString();
  }

  if (consecutiveFailures >= 5) {
    update.enabled = false;
    update.disabled_at = new Date().toISOString();
  }

  await supabase.from("model_endpoints").update(update).eq("id", endpointId);
}

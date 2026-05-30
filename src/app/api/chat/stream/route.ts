import { withAuth, parseJsonBody } from "@/lib/api-handler";
import { FallbackRouter } from "@/lib/gateway/fallback";
import {
  runPreflightChecks,
  recordCallSuccess,
  resolveEndpoint,
  getModelPrices,
  calculateCost,
} from "@/lib/gateway/helpers";
import { getAdapter } from "@/lib/providers";
import type { ProviderType } from "@/types/database";
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

export const POST = withAuth(async ({ user, supabase }, request) => {

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body as unknown as StreamRequestBody;
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

  // Pre-flight: sensitive scan + task run + validation + budget
  const preflight = await runPreflightChecks(supabase, user.id, messages, {
    task_type, strategy, model_endpoint_id, save_policy, scan_sensitive,
  });

  if (!preflight.ok) {
    return new Response(JSON.stringify(preflight.body), {
      status: preflight.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const taskRunId = preflight.taskRunId;

  // Use FallbackRouter to get ordered endpoints
  const fallbackRouter = new FallbackRouter(supabase);
  const endpoints = await fallbackRouter.getFallbackChain(
    user.id, task_type, strategy, model_endpoint_id
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      sendEvent({ type: "start", task_run_id: taskRunId });

      try {
        if (endpoints.length === 0) {
          sendEvent({ type: "error", error: "No available endpoints" });
          await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRunId);
          controller.close();
          return;
        }

        const maxAttempts = Math.min(endpoints.length, 3);
        const attempts: Array<{ attempt_number: number; endpoint_id: string; error_message?: string; success: boolean }> = [];
        let success = false;

        for (let i = 0; i < maxAttempts; i++) {
          const ep = endpoints[i];
          const attemptStart = Date.now();

          try {
            const resolved = await resolveEndpoint(supabase, ep.id);
            if (!resolved) throw new Error("Failed to resolve endpoint");

            const adapter = getAdapter(resolved.providerType as ProviderType);
            if (!adapter.chatCompletionStream) {
              throw new Error("Stream not supported for this provider");
            }

            const chatRequest = {
              model: resolved.providerModelId,
              messages,
              temperature,
              max_tokens,
              stream: true,
            };

            let inputTokens = 0;
            let outputTokens = 0;

            for await (const chunk of adapter.chatCompletionStream(resolved.plaintextKey, resolved.baseUrl, chatRequest)) {
              sendEvent({ type: "delta", content: chunk.delta, model: chunk.model });

              if (chunk.input_tokens) inputTokens = chunk.input_tokens;
              if (chunk.output_tokens) outputTokens = chunk.output_tokens;

              if (chunk.finish_reason) {
                const prices = await getModelPrices(supabase, user.id, resolved.modelId);
                const cost = calculateCost(inputTokens, outputTokens, prices);
                const latencyMs = Date.now() - attemptStart;

                await recordCallSuccess(supabase, user.id, {
                  taskRunId, taskType: task_type, endpointId: ep.id,
                  apiKeyId: resolved.apiKeyId, modelId: resolved.modelId,
                  providerId: resolved.providerId, subscriptionId: resolved.subscriptionId,
                  inputTokens, outputTokens, cost, latencyMs, fallbackAttempt: i,
                });

                sendEvent({
                  type: "end", finish_reason: chunk.finish_reason,
                  input_tokens: inputTokens, output_tokens: outputTokens,
                  cost, latency_ms: latencyMs, endpoint_id: ep.id,
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
              endpoint_id: ep.id,
              error_message: error.message,
              success: false,
            });

            // Health update via RPC (best-effort)
            try {
              await supabase.rpc("update_endpoint_health", {
                p_endpoint_id: ep.id, p_success: false,
              });
            } catch {}

            if (i === maxAttempts - 1) {
              sendEvent({ type: "error", error: error.message, fallback_attempts: attempts });
            }
          }
        }

        if (!success) {
          await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRunId);
        }
      } catch (err: unknown) {
        const error = err as Error;
        sendEvent({ type: "error", error: error.message });
        await supabase.from("task_runs").update({ status: "failed" }).eq("id", taskRunId);
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
});

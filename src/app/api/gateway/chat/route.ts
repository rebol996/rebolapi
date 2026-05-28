import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashToken } from "@/lib/token";
import { executeGatewayCall } from "@/lib/gateway";
import { checkGatewayTokenRateLimit, validateEndpointId, validateMaxTokens, validateMessages, validateStrategy, validateTaskType, validateTemperature } from "@/lib/security/validation";
import type { ChatMessage } from "@/lib/providers/types";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer rba_")) {
    return NextResponse.json({ error: "Invalid gateway token" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const tokenHash = hashToken(token);

  const supabase = createServiceRoleClient();

  const { data: gatewayToken } = await supabase
    .from("gateway_tokens")
    .select("id, user_id, scopes, status, rate_limit_per_minute")
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .single();

  if (!gatewayToken) {
    return NextResponse.json({ error: "Invalid or revoked token" }, { status: 401 });
  }

  if (gatewayToken.rate_limit_per_minute) {
    const allowed = checkGatewayTokenRateLimit(gatewayToken.id, gatewayToken.rate_limit_per_minute);
    if (!allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }
  }

  const scopes = gatewayToken.scopes as string[];
  if (!scopes.some((s) => s.startsWith("chat"))) {
    return NextResponse.json({ error: "Insufficient scope" }, { status: 403 });
  }

  await supabase
    .from("gateway_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", gatewayToken.id);

  let body: {
    messages?: ChatMessage[];
    model_endpoint_id?: string;
    strategy?: string;
    task_type?: string;
    temperature?: number;
    max_tokens?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, model_endpoint_id, strategy = "balanced", task_type = "chat", temperature, max_tokens }: {
    messages?: ChatMessage[];
    model_endpoint_id?: string;
    strategy?: string;
    task_type?: string;
    temperature?: number;
    max_tokens?: number;
  } = body;

  const validationErrors: string[] = [];
  const messagesValidation = validateMessages(messages);
  if (!messagesValidation.valid) validationErrors.push(...messagesValidation.errors);

  const endpointValidation = validateEndpointId(model_endpoint_id);
  if (!endpointValidation.valid) validationErrors.push(...endpointValidation.errors);

  const strategyValidation = validateStrategy(strategy);
  if (!strategyValidation.valid) validationErrors.push(...strategyValidation.errors);

  const taskTypeValidation = validateTaskType(task_type);
  if (!taskTypeValidation.valid) validationErrors.push(...taskTypeValidation.errors);

  const tempValidation = validateTemperature(temperature);
  if (!tempValidation.valid) validationErrors.push(...tempValidation.errors);

  const tokensValidation = validateMaxTokens(max_tokens);
  if (!tokensValidation.valid) validationErrors.push(...tokensValidation.errors);

  if (validationErrors.length > 0) {
    return NextResponse.json({
      error: "Validation failed",
      details: validationErrors,
    }, { status: 400 });
  }

  const userId = gatewayToken.user_id as string;

  const result = await executeGatewayCall(supabase, userId, {
    messages: messages!,
    model_endpoint_id,
    strategy,
    task_type,
    temperature,
    max_tokens,
    scan_sensitive: false,
    save_policy: "metadata_only",
  });

  if (!result.success) {
    const statusCode = result.validation_errors?.some((e) => e.code === "BUDGET_EXCEEDED") ? 402
      : result.validation_errors?.some((e) => e.code === "ENDPOINT_NOT_FOUND") ? 404
      : result.error === "All endpoints failed" ? 502
      : 500;

    return NextResponse.json({
      error: result.error,
      error_type: result.error_type,
      validation_errors: result.validation_errors,
      fallback_attempts: result.fallback_attempts,
      task_run_id: result.task_run_id,
    }, { status: statusCode });
  }

  return NextResponse.json({
    id: result.data!.id,
    model: result.data!.model,
    content: result.data!.content,
    usage: {
      input_tokens: result.data!.input_tokens,
      output_tokens: result.data!.output_tokens,
      total_tokens: result.data!.total_tokens,
    },
    latency_ms: result.data!.latency_ms,
    task_run_id: result.task_run_id,
    fallback_attempts: result.fallback_attempts,
  });
}

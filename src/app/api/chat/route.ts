import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scanForSensitiveInfo, redactSensitiveInfo } from "@/lib/sensitive-scanner";
import { executeGatewayCall } from "@/lib/gateway";
import { validateMessages, validateEndpointId, validateStrategy, validateTaskType, validateTemperature, validateMaxTokens } from "@/lib/security/validation";
import type { ChatMessage } from "@/lib/providers/types";

interface ChatRequestBody {
  messages: ChatMessage[];
  model_endpoint_id?: string;
  strategy?: string;
  task_type?: string;
  temperature?: number;
  max_tokens?: number;
  scan_sensitive?: boolean;
  sensitive_action?: "cancel" | "send_anyway" | "redact";
  save_policy?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    messages,
    model_endpoint_id,
    strategy = "manual",
    task_type = "chat",
    temperature,
    max_tokens,
    scan_sensitive = true,
    sensitive_action = "cancel",
    save_policy = "metadata_only",
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

  let processedMessages = messages;

  if (scan_sensitive) {
    const fullText = messages.map((m) => m.content).join(" ");
    const scanResult = scanForSensitiveInfo(fullText);
    
    if (scanResult.found) {
      if (sensitive_action === "cancel") {
        return NextResponse.json({
          error: "Sensitive information detected",
          sensitive_scan: scanResult.patterns.map((p) => ({ type: p.type, position: p.start })),
          action_required: true,
        }, { status: 400 });
      } else if (sensitive_action === "redact") {
        processedMessages = messages.map((m) => ({
          ...m,
          content: redactSensitiveInfo(m.content, scanResult.patterns.filter((p) => {
            const msgStart = fullText.indexOf(m.content);
            return p.start >= msgStart && p.start < msgStart + m.content.length;
          })),
        }));
      }
    }
  }

  const result = await executeGatewayCall(supabase, user.id, {
    messages: processedMessages,
    model_endpoint_id,
    strategy,
    task_type,
    temperature,
    max_tokens,
    scan_sensitive,
    save_policy,
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
    data: result.data,
    budget_warnings: result.budget_warnings,
    fallback_attempts: result.fallback_attempts,
    task_run_id: result.task_run_id,
  });
}

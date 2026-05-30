import { NextResponse } from "next/server";
import { withAuth, parseJsonBody } from "@/lib/api-handler";
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

export const POST = withAuth(async ({ user, supabase }, request) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body as unknown as ChatRequestBody;

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
    // Scan each message individually to avoid offset issues with duplicate content
    let hasSensitive = false;
    const perMessageScans = messages.map((m) => {
      const result = scanForSensitiveInfo(m.content);
      if (result.found) hasSensitive = true;
      return result;
    });

    if (hasSensitive) {
      if (sensitive_action === "cancel") {
        const allPatterns = perMessageScans.flatMap((s) => s.patterns);
        return NextResponse.json({
          error: "Sensitive information detected",
          sensitive_scan: allPatterns.map((p) => ({ type: p.type, position: p.start })),
          action_required: true,
        }, { status: 400 });
      } else if (sensitive_action === "redact") {
        processedMessages = messages.map((m, i) => ({
          ...m,
          content: perMessageScans[i].found
            ? redactSensitiveInfo(m.content, perMessageScans[i].patterns)
            : m.content,
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
});

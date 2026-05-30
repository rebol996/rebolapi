import { NextResponse } from "next/server";
import { withAuthParams, parseJsonBody } from "@/lib/api-handler";
import { executeGatewayCall } from "@/lib/gateway";
import { validateMessages, validateEndpointId, validateStrategy, validateTemperature, validateMaxTokens } from "@/lib/security/validation";

const TASK_PROMPTS: Record<string, string> = {
  analyze: "Analyze the following code or text. Identify issues, patterns, and provide insights.",
  review: "Review this code for bugs, security issues, performance problems, and best practice violations.",
  plan: "Create a detailed architecture and implementation plan for the following.",
  refactor: "Analyze this code and provide a refactoring plan with specific improvements.",
  bug_diagnosis: "Diagnose the bug described below. Identify the root cause and propose fixes.",
  test_generation: "Generate comprehensive tests for the following code.",
  security_review: "Perform a security review of the following. Identify vulnerabilities and suggest mitigations.",
  performance_analysis: "Analyze the performance of the following. Identify bottlenecks and suggest optimizations.",
  pr_description: "Generate a PR description based on the following changes.",
  commit_message: "Generate a concise, conventional commit message for the following changes.",
  requirement_breakdown: "Break down the following requirements into actionable tasks and user stories.",
  architecture_planning: "Create a detailed architecture plan for the following. Include component diagrams, data flow, API design, and technology choices.",
};

export const POST = withAuthParams(async ({ user, supabase }, request, { task }) => {
  const taskPrompt = TASK_PROMPTS[task];
  if (!taskPrompt) {
    return NextResponse.json({ error: `Unknown task: ${task}. Available: ${Object.keys(TASK_PROMPTS).join(", ")}` }, { status: 400 });
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  const rawMessages = body.messages as Array<{ role: string; content: string }> | undefined;
  const model_endpoint_id = body.model_endpoint_id as string | undefined;
  const strategy = (body.strategy as string) || "balanced";
  const temperature = body.temperature as number | undefined;
  const max_tokens = body.max_tokens as number | undefined;

  if (!rawMessages || rawMessages.length === 0) {
    return NextResponse.json({ error: "Messages are required" }, { status: 400 });
  }

  const messages = [
    { role: "system" as const, content: taskPrompt },
    ...rawMessages,
  ];

  // Validate inputs
  const validationErrors: string[] = [];
  const messagesValidation = validateMessages(messages);
  if (!messagesValidation.valid) validationErrors.push(...messagesValidation.errors);
  const endpointValidation = validateEndpointId(model_endpoint_id);
  if (!endpointValidation.valid) validationErrors.push(...endpointValidation.errors);
  const strategyValidation = validateStrategy(strategy);
  if (!strategyValidation.valid) validationErrors.push(...strategyValidation.errors);
  const tempValidation = validateTemperature(temperature);
  if (!tempValidation.valid) validationErrors.push(...tempValidation.errors);
  const tokensValidation = validateMaxTokens(max_tokens);
  if (!tokensValidation.valid) validationErrors.push(...tokensValidation.errors);

  if (validationErrors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: validationErrors }, { status: 400 });
  }

  // Call gateway directly instead of self-fetching
  const result = await executeGatewayCall(supabase, user.id, {
    messages,
    model_endpoint_id,
    strategy,
    task_type: task,
    temperature: temperature ?? 0.3,
    max_tokens,
    scan_sensitive: true,
    save_policy: "metadata_only",
  });

  if (!result.success) {
    const statusCode = result.validation_errors?.some((e) => e.code === "BUDGET_EXCEEDED") ? 402
      : result.validation_errors?.some((e) => e.code === "ENDPOINT_NOT_FOUND") ? 404
      : result.error === "All endpoints failed" ? 502
      : 500;
    return NextResponse.json({
      error: result.error,
      validation_errors: result.validation_errors,
      fallback_attempts: result.fallback_attempts,
      task_run_id: result.task_run_id,
    }, { status: statusCode });
  }

  return NextResponse.json({
    data: result.data,
    budget_warnings: result.budget_warnings,
    task_run_id: result.task_run_id,
  });
});

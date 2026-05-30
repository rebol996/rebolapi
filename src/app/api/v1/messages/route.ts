import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { validateGatewayToken } from "@/lib/gateway/auth";
import { executeGatewayCall } from "@/lib/gateway";
import { sanitizeModelName } from "@/lib/security/validation";
import type { ChatMessage } from "@/lib/providers/types";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const xApiKey = request.headers.get("x-api-key");

  const auth = await validateGatewayToken(authHeader, xApiKey, "anthropic:compatible");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    model?: string;
    messages?: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
    max_tokens?: number;
    system?: string;
    temperature?: number;
    stream?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.messages || body.messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  if (!body.model) {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }

  const sanitizedModel = sanitizeModelName(body.model);
  if (!sanitizedModel) {
    return NextResponse.json({ error: "Invalid model name" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Find endpoint by model name (safe parameterized approach)
  type EndpointLookup = { id: string; provider_model_id: string; models: { display_name: string } | null };

  let endpoint: EndpointLookup | null = null;

  const { data: endpointByModelId } = await supabase
    .from("model_endpoints")
    .select("id, provider_model_id, models(display_name)")
    .eq("user_id", auth.userId)
    .eq("enabled", true)
    .eq("is_available", true)
    .eq("provider_model_id", sanitizedModel)
    .limit(1)
    .maybeSingle();

  if (endpointByModelId) {
    endpoint = endpointByModelId as unknown as EndpointLookup;
  } else {
    const { data: endpointByDisplayName } = await supabase
      .from("model_endpoints")
      .select("id, provider_model_id, models!inner(display_name)")
      .eq("user_id", auth.userId)
      .eq("enabled", true)
      .eq("is_available", true)
      .eq("models.display_name", sanitizedModel)
      .limit(1)
      .maybeSingle();
    endpoint = endpointByDisplayName as unknown as EndpointLookup;
  }

  if (!endpoint) {
    return NextResponse.json({ error: { type: "not_found_error", message: `Model "${body.model}" not found or not available` } }, { status: 404 });
  }

  // Convert Anthropic messages to internal format
  // Anthropic puts system as a top-level field, not in messages
  const messages: ChatMessage[] = [];

  if (body.system) {
    messages.push({ role: "system", content: body.system });
  }

  for (const m of body.messages) {
    let content: string;
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content.filter((b) => b.type === "text").map((b) => b.text || "").join("");
    } else {
      content = "";
    }
    messages.push({ role: m.role as ChatMessage["role"], content });
  }

  const result = await executeGatewayCall(supabase, auth.userId, {
    messages,
    model_endpoint_id: endpoint.id,
    strategy: "manual",
    task_type: "chat",
    max_tokens: body.max_tokens || 4096,
    temperature: body.temperature,
    scan_sensitive: false,
    save_policy: "metadata_only",
    gateway_token_id: auth.tokenId,
  });

  if (!result.success) {
    return NextResponse.json({
      type: "error",
      error: { type: "api_error", message: result.error || "Unknown error" },
    }, { status: 500 });
  }

  // Return Anthropic-compatible response
  return NextResponse.json({
    id: `msg_${result.data!.task_run_id.replace(/-/g, "").slice(0, 24)}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: result.data!.content }],
    model: body.model,
    stop_reason: "end_turn",
    usage: {
      input_tokens: result.data!.input_tokens,
      output_tokens: result.data!.output_tokens,
    },
  });
}

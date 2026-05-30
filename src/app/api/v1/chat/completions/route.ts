import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { validateGatewayToken } from "@/lib/gateway/auth";
import { executeGatewayCall } from "@/lib/gateway";
import { sanitizeModelName } from "@/lib/security/validation";
import type { ChatMessage } from "@/lib/providers/types";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const xApiKey = request.headers.get("x-api-key");

  const auth = await validateGatewayToken(authHeader, xApiKey, "chat:write");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    model?: string;
    messages?: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
    temperature?: number;
    max_tokens?: number;
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
  // Try provider_model_id first, then display_name as fallback
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
    return NextResponse.json({ error: `Model "${body.model}" not found or not available` }, { status: 404 });
  }

  // Convert OpenAI messages format to our internal format
  const messages: ChatMessage[] = body.messages.map((m) => {
    let content: string;
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content.filter((b) => b.type === "text").map((b) => b.text || "").join("");
    } else {
      content = "";
    }
    return { role: m.role as ChatMessage["role"], content };
  });

  const result = await executeGatewayCall(supabase, auth.userId, {
    messages,
    model_endpoint_id: endpoint.id,
    strategy: "manual",
    task_type: "chat",
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    scan_sensitive: false,
    save_policy: "metadata_only",
    gateway_token_id: auth.tokenId,
  });

  if (!result.success) {
    const statusCode = result.error === "All endpoints failed" ? 502 : 500;
    return NextResponse.json({
      error: { message: result.error || "Unknown error", type: "server_error", code: "internal_error" },
    }, { status: statusCode });
  }

  // Return OpenAI-compatible response
  return NextResponse.json({
    id: `chatcmpl-${result.data!.task_run_id.slice(0, 12)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: result.data!.content,
      },
      finish_reason: "stop",
    }],
    usage: {
      prompt_tokens: result.data!.input_tokens,
      completion_tokens: result.data!.output_tokens,
      total_tokens: result.data!.total_tokens,
    },
  });
}

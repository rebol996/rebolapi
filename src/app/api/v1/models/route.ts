import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { validateGatewayToken } from "@/lib/gateway/auth";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const xApiKey = request.headers.get("x-api-key");

  const auth = await validateGatewayToken(authHeader, xApiKey, "models:read");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServiceRoleClient();

  const { data: endpoints, error } = await supabase
    .from("model_endpoints")
    .select("id, provider_model_id, enabled, is_available, models(display_name, supports_vision, supports_streaming)")
    .eq("user_id", auth.userId)
    .eq("enabled", true)
    .eq("is_available", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const models = (endpoints || []).map((ep) => ({
    id: ep.provider_model_id,
    object: "model" as const,
    created: Math.floor(Date.now() / 1000),
    owned_by: "rebol-gateway",
    display_name: (ep.models as unknown as Record<string, unknown>)?.display_name as string || ep.provider_model_id,
  }));

  return NextResponse.json({
    object: "list",
    data: models,
  });
}

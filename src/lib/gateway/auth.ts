import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashToken } from "@/lib/token";

export interface GatewayAuthResult {
  userId: string;
  tokenId: string;
  scopes: string[];
  rateLimitPerMinute: number | null;
}

export async function validateGatewayToken(
  authHeader: string | null,
  xApiKey: string | null,
  requiredScope: string,
): Promise<GatewayAuthResult | { error: string; status: number }> {
  let token: string | null = null;

  if (authHeader?.startsWith("Bearer rba_")) {
    token = authHeader.slice(7);
  } else if (xApiKey?.startsWith("rba_")) {
    token = xApiKey;
  }

  if (!token) {
    return { error: "Missing or invalid gateway token", status: 401 };
  }

  const tokenHash = hashToken(token);
  const supabase = createServiceRoleClient();

  const { data: gatewayToken } = await supabase
    .from("gateway_tokens")
    .select("id, user_id, scopes, status, rate_limit_per_minute")
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .single();

  if (!gatewayToken) {
    return { error: "Invalid or revoked token", status: 401 };
  }

  const scopes = gatewayToken.scopes as string[];
  if (!scopes.some((s) => {
    if (s === "admin") return true;
    if (s === requiredScope) return true;
    // "anthropic:compatible" is an alias for "chat:write" (used by /v1/messages)
    if (s === "chat:write" && requiredScope === "anthropic:compatible") return true;
    // "chat:write" implies "chat:read"; "models:write" implies "models:read"
    const [reqResource, reqAction] = requiredScope.split(":");
    const [sResource, sAction] = s.split(":");
    return sResource === reqResource && sAction === "write" && reqAction === "read";
  })) {
    return { error: "Insufficient scope", status: 403 };
  }

  // Check rate limit before proceeding
  const rateLimit = gatewayToken.rate_limit_per_minute as number | null;
  if (rateLimit && rateLimit > 0) {
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase
      .from("usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("gateway_token_id", gatewayToken.id)
      .gte("created_at", oneMinuteAgo);
    if ((count ?? 0) >= rateLimit) {
      return { error: "Rate limit exceeded", status: 429 };
    }
  }

  // Update last_used_at
  await supabase
    .from("gateway_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", gatewayToken.id);

  return {
    userId: gatewayToken.user_id as string,
    tokenId: gatewayToken.id as string,
    scopes,
    rateLimitPerMinute: rateLimit,
  };
}

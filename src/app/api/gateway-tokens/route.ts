import { NextResponse } from "next/server";
import { generateToken, hashToken } from "@/lib/token";
import { withAuth, handleDbError } from "@/lib/api-handler";

export const GET = withAuth(async ({ user, supabase }) => {
  const { data, error } = await supabase
    .from("gateway_tokens")
    .select("id, user_id, name, scopes, rate_limit_per_minute, status, last_used_at, created_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const POST = withAuth(async ({ user, supabase }, request) => {
  const body = await request.json() as Record<string, unknown>;
  const { name, scopes, rate_limit_per_minute } = body;

  const plaintextToken = generateToken();
  const token_hash = hashToken(plaintextToken);

  const { data, error } = await supabase
    .from("gateway_tokens")
    .insert({
      user_id: user.id,
      name,
      token_hash,
      scopes: scopes || ["chat:write"],
      rate_limit_per_minute,
    })
    .select("id, name, scopes, rate_limit_per_minute, status, created_at")
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data: { ...data, token: plaintextToken } }, { status: 201 });
});

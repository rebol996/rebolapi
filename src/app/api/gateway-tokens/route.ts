import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/token";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("gateway_tokens")
    .select("id, user_id, name, scopes, rate_limit_per_minute, status, last_used_at, created_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { ...data, token: plaintextToken } }, { status: 201 });
}

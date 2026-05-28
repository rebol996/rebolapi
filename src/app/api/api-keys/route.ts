import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt, createKeyPreview } from "@/lib/crypto";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, user_id, subscription_id, provider_id, key_alias, key_preview, base_url, status, allowed_tasks, blocked_tasks, monthly_budget, single_call_budget, rate_limit_per_minute, max_parallel_requests, last_used_at, last_checked_at, failure_count, notes, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { plaintext_key, ...rest } = body;

  if (!plaintext_key) {
    return NextResponse.json({ error: "plaintext_key is required" }, { status: 400 });
  }

  const encrypted_key = encrypt(plaintext_key);
  const key_preview = createKeyPreview(plaintext_key);

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      ...rest,
      encrypted_key,
      key_preview,
      user_id: user.id,
    })
    .select("id, user_id, subscription_id, provider_id, key_alias, key_preview, base_url, status, allowed_tasks, blocked_tasks, monthly_budget, single_call_budget, rate_limit_per_minute, max_parallel_requests, last_used_at, last_checked_at, failure_count, notes, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt, createKeyPreview } from "@/lib/crypto";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, user_id, subscription_id, provider_id, key_alias, key_preview, base_url, status, allowed_tasks, blocked_tasks, monthly_budget, single_call_budget, rate_limit_per_minute, max_parallel_requests, last_used_at, last_checked_at, failure_count, notes, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { plaintext_key, ...rest } = body;

  const updateData: Record<string, unknown> = { ...rest };
  if (plaintext_key) {
    updateData.encrypted_key = encrypt(plaintext_key);
    updateData.key_preview = createKeyPreview(plaintext_key);
  }

  const { data, error } = await supabase
    .from("api_keys")
    .update(updateData)
    .eq("id", id)
    .select("id, user_id, subscription_id, provider_id, key_alias, key_preview, base_url, status, allowed_tasks, blocked_tasks, monthly_budget, single_call_budget, rate_limit_per_minute, max_parallel_requests, last_used_at, last_checked_at, failure_count, notes, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase
    .from("api_keys")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

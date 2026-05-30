import { NextResponse } from "next/server";
import { encrypt, createKeyPreview } from "@/lib/crypto";
import { withAuth, parseJsonBody, handleDbError } from "@/lib/api-handler";

const API_KEY_SELECT = "id, user_id, subscription_id, provider_id, key_alias, key_preview, base_url, status, allowed_tasks, blocked_tasks, monthly_budget, single_call_budget, rate_limit_per_minute, max_parallel_requests, last_used_at, last_checked_at, failure_count, notes, created_at, updated_at";

export const GET = withAuth(async ({ user, supabase }, request) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");

  const { data, error } = await supabase
    .from("api_keys")
    .select(API_KEY_SELECT)
    .eq("user_id", user.id)
    .range(offset, offset + limit - 1)
    .order("created_at", { ascending: false });

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const POST = withAuth(async ({ user, supabase }, request) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  const plaintext_key = body.plaintext_key as string | undefined;
  if (!plaintext_key) {
    return NextResponse.json({ error: "plaintext_key is required" }, { status: 400 });
  }

  const encrypted_key = encrypt(plaintext_key);
  const key_preview = createKeyPreview(plaintext_key);

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      provider_id: body.provider_id as string,
      subscription_id: (body.subscription_id as string) || null,
      key_alias: body.key_alias as string,
      encrypted_key,
      key_preview,
      base_url: (body.base_url as string) || null,
      status: (body.status as string) || "active",
      allowed_tasks: body.allowed_tasks as string[] | null || null,
      blocked_tasks: body.blocked_tasks as string[] | null || null,
      monthly_budget: (body.monthly_budget as number) || null,
      single_call_budget: (body.single_call_budget as number) || null,
      rate_limit_per_minute: (body.rate_limit_per_minute as number) || null,
      max_parallel_requests: (body.max_parallel_requests as number) || null,
      notes: (body.notes as string) || null,
      user_id: user.id,
    })
    .select(API_KEY_SELECT)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data }, { status: 201 });
});

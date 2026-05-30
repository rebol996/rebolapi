import { NextResponse } from "next/server";
import { encrypt, createKeyPreview } from "@/lib/crypto";
import { withAuthParams, parseJsonBody, pickFields, handleDbError } from "@/lib/api-handler";

const API_KEY_SELECT = "id, user_id, subscription_id, provider_id, key_alias, key_preview, base_url, status, allowed_tasks, blocked_tasks, monthly_budget, single_call_budget, rate_limit_per_minute, max_parallel_requests, last_used_at, last_checked_at, failure_count, notes, created_at, updated_at";

const ALLOWED_UPDATE_FIELDS = [
  "subscription_id", "provider_id", "key_alias", "base_url", "status",
  "allowed_tasks", "blocked_tasks", "monthly_budget", "single_call_budget",
  "rate_limit_per_minute", "max_parallel_requests", "notes",
];

export const GET = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { data, error } = await supabase
    .from("api_keys")
    .select(API_KEY_SELECT)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) return handleDbError(error, 404);
  return NextResponse.json({ data });
});

export const PUT = withAuthParams(async ({ user, supabase }, request, { id }) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { plaintext_key, ...rest } = parsed.body;

  const updateData = pickFields(rest, ALLOWED_UPDATE_FIELDS);

  if (plaintext_key) {
    updateData.encrypted_key = encrypt(plaintext_key as string);
    updateData.key_preview = createKeyPreview(plaintext_key as string);
  }

  const { data, error } = await supabase
    .from("api_keys")
    .update(updateData)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(API_KEY_SELECT)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const DELETE = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { error } = await supabase
    .from("api_keys")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return handleDbError(error);
  return NextResponse.json({ success: true });
});

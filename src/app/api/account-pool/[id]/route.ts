import { NextResponse } from "next/server";
import { encrypt, createKeyPreview } from "@/lib/crypto";
import { withAuthParams, parseJsonBody, handleDbError } from "@/lib/api-handler";

const SELECT_FIELDS = "id, name, platform_type, platform_name, base_url, auth_method, key_preview, status, last_sync_at, sync_error, notes, created_at, updated_at";

const ALLOWED_UPDATE_FIELDS = ["name", "platform_type", "platform_name", "base_url", "notes"];

export const GET = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { data, error } = await supabase
    .from("account_pool_items")
    .select(SELECT_FIELDS)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) return handleDbError(error, 404);
  return NextResponse.json({ data });
});

export const PUT = withAuthParams(async ({ user, supabase }, request, { id }) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  const update: Record<string, unknown> = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field];
  }

  if (body.plaintext_key) {
    try {
      update.encrypted_api_key = encrypt(body.plaintext_key as string);
      update.key_preview = createKeyPreview(body.plaintext_key as string);
      update.status = "needs_sync";
    } catch {
      return NextResponse.json({ error: "Failed to encrypt API key" }, { status: 500 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("account_pool_items")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SELECT_FIELDS)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const DELETE = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { error } = await supabase
    .from("account_pool_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return handleDbError(error);
  return NextResponse.json({ success: true });
});

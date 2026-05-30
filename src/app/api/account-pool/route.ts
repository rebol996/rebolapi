import { NextResponse } from "next/server";
import { encrypt, createKeyPreview } from "@/lib/crypto";
import { withAuth, parseJsonBody, handleDbError } from "@/lib/api-handler";

const SELECT_FIELDS = "id, name, platform_type, platform_name, base_url, auth_method, key_preview, status, last_sync_at, sync_error, notes, created_at, updated_at";

export const GET = withAuth(async ({ user, supabase }) => {
  const { data, error } = await supabase
    .from("account_pool_items")
    .select(SELECT_FIELDS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const POST = withAuth(async ({ user, supabase }, request) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { name, platform_type, platform_name, base_url, plaintext_key, notes } = parsed.body as Record<string, unknown>;

  if (!name || !platform_name || !base_url || !plaintext_key) {
    return NextResponse.json({ error: "Missing required fields: name, platform_name, base_url, plaintext_key" }, { status: 400 });
  }

  let encrypted_api_key: string;
  let key_preview: string;
  try {
    encrypted_api_key = encrypt(plaintext_key as string);
    key_preview = createKeyPreview(plaintext_key as string);
  } catch {
    return NextResponse.json({ error: "Failed to encrypt API key" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("account_pool_items")
    .insert({
      user_id: user.id,
      name,
      platform_type: platform_type || "proxy",
      platform_name,
      base_url,
      auth_method: "api_key",
      encrypted_api_key,
      key_preview,
      status: "needs_sync",
      notes: notes || null,
    })
    .select(SELECT_FIELDS)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data }, { status: 201 });
});

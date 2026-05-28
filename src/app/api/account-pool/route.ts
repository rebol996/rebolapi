import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt, createKeyPreview } from "@/lib/crypto";

const SELECT_FIELDS = "id, name, platform_type, platform_name, base_url, auth_method, key_preview, status, last_sync_at, sync_error, notes, created_at, updated_at";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("account_pool_items")
    .select(SELECT_FIELDS)
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
  const { name, platform_type, platform_name, base_url, plaintext_key, notes } = body;

  if (!name || !platform_name || !base_url || !plaintext_key) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  let encrypted_api_key: string;
  let key_preview: string;
  try {
    encrypted_api_key = encrypt(plaintext_key);
    key_preview = createKeyPreview(plaintext_key);
  } catch {
    return NextResponse.json({ error: "密钥加密失败" }, { status: 500 });
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

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "该接入地址和密钥已存在" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}

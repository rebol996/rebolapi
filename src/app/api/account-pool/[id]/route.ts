import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt, createKeyPreview } from "@/lib/crypto";

const SELECT_FIELDS = "id, name, platform_type, platform_name, base_url, auth_method, key_preview, status, last_sync_at, sync_error, notes, created_at, updated_at";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await supabase
    .from("account_pool_items")
    .select(`${SELECT_FIELDS}, encrypted_api_key`)
    .eq("id", id)
    .eq("user_id", user.id)
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
  const update: Record<string, unknown> = {};

  if (body.name !== undefined) update.name = body.name;
  if (body.platform_type !== undefined) update.platform_type = body.platform_type;
  if (body.platform_name !== undefined) update.platform_name = body.platform_name;
  if (body.base_url !== undefined) update.base_url = body.base_url;
  if (body.notes !== undefined) update.notes = body.notes || null;

  if (body.plaintext_key) {
    try {
      update.encrypted_api_key = encrypt(body.plaintext_key);
      update.key_preview = createKeyPreview(body.plaintext_key);
      update.status = "needs_sync";
    } catch {
      return NextResponse.json({ error: "密钥加密失败" }, { status: 500 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "没有需要更新的字段" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("account_pool_items")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SELECT_FIELDS)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "该接入地址和密钥已存在" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase
    .from("account_pool_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

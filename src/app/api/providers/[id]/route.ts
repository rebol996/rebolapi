import { NextResponse } from "next/server";
import { withAuthParams, parseJsonBody, pickFields, handleDbError } from "@/lib/api-handler";

const PROVIDER_SELECT = "id, user_id, name, slug, provider_type, base_url, models_endpoint, chat_endpoint, auth_type, status, notes, created_at, updated_at";

const ALLOWED_UPDATE_FIELDS = ["name", "slug", "provider_type", "base_url", "models_endpoint", "chat_endpoint", "auth_type", "default_headers", "status", "notes"];

export const GET = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { data, error } = await supabase
    .from("providers")
    .select(PROVIDER_SELECT)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) return handleDbError(error, 404);
  return NextResponse.json({ data });
});

export const PUT = withAuthParams(async ({ user, supabase }, request, { id }) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const update = pickFields(parsed.body, ALLOWED_UPDATE_FIELDS);
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("providers")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(PROVIDER_SELECT)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const DELETE = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { error } = await supabase
    .from("providers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return handleDbError(error);
  return NextResponse.json({ success: true });
});

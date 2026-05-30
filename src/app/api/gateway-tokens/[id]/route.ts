import { NextResponse } from "next/server";
import { withAuthParams, parseJsonBody, pickFields, handleDbError } from "@/lib/api-handler";

const TOKEN_SELECT = "id, user_id, name, scopes, rate_limit_per_minute, status, last_used_at, created_at, revoked_at";
const ALLOWED_UPDATE_FIELDS = ["name", "scopes", "rate_limit_per_minute", "status"];

export const PUT = withAuthParams(async ({ user, supabase }, request, { id }) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const update = pickFields(parsed.body, ALLOWED_UPDATE_FIELDS);
  // Handle revocation timestamp
  if (parsed.body.status === "revoked") update.revoked_at = new Date().toISOString();
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("gateway_tokens")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(TOKEN_SELECT)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const DELETE = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { error } = await supabase.from("gateway_tokens").delete().eq("id", id).eq("user_id", user.id);
  if (error) return handleDbError(error);
  return NextResponse.json({ success: true });
});

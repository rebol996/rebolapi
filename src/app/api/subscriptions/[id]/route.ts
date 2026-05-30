import { NextResponse } from "next/server";
import { withAuthParams, parseJsonBody, pickFields, handleDbError } from "@/lib/api-handler";

const SELECT_FIELDS = "id, user_id, platform, plan_name, alias, account_label, source_type, vendor_url, console_url, price, currency, billing_cycle, purchase_date, renewal_date, expires_at, auto_renew, status, quota_type, quota_total, quota_used, tags, notes, created_at, updated_at";
const ALLOWED_UPDATE_FIELDS = ["platform", "plan_name", "alias", "account_label", "source_type", "vendor_url", "console_url", "price", "currency", "billing_cycle", "purchase_date", "renewal_date", "expires_at", "auto_renew", "status", "quota_type", "quota_total", "quota_used", "tags", "notes"];

export const GET = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { data, error } = await supabase
    .from("subscriptions")
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

  const update = pickFields(parsed.body, ALLOWED_UPDATE_FIELDS);
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("subscriptions")
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
    .from("subscriptions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return handleDbError(error);
  return NextResponse.json({ success: true });
});

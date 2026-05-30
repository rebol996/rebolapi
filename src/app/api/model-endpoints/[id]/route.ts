import { NextResponse } from "next/server";
import { withAuthParams, parseJsonBody, pickFields, handleDbError } from "@/lib/api-handler";

const ENDPOINT_SELECT = "id, user_id, api_key_id, model_id, provider_model_id, is_available, enabled, priority, health_score, success_count, failure_count, consecutive_failures, avg_latency_ms, last_success_at, last_error_at, notes, created_at, updated_at";
const ALLOWED_UPDATE_FIELDS = ["is_available", "enabled", "priority", "quota_type", "quota_total", "quota_used", "reset_cycle", "reset_date", "low_quota_alert", "allowed_tasks", "blocked_tasks", "notes"];

export const GET = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { data, error } = await supabase
    .from("model_endpoints")
    .select(ENDPOINT_SELECT)
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
    .from("model_endpoints")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(ENDPOINT_SELECT)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const DELETE = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { error } = await supabase
    .from("model_endpoints")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return handleDbError(error);
  return NextResponse.json({ success: true });
});

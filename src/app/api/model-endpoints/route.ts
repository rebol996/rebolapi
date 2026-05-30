import { NextResponse } from "next/server";
import { withAuth, parseJsonBody, handleDbError } from "@/lib/api-handler";

const ENDPOINT_SELECT = "id, user_id, api_key_id, model_id, provider_model_id, is_available, enabled, priority, health_score, success_count, failure_count, consecutive_failures, avg_latency_ms, last_success_at, last_error_at";

export const GET = withAuth(async ({ user, supabase }, request) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "300"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");

  const { data, error } = await supabase
    .from("model_endpoints")
    .select("id, user_id, api_key_id, model_id, provider_model_id, is_available, enabled, priority, health_score, success_count, failure_count, consecutive_failures, avg_latency_ms, last_success_at, last_error_at, api_keys(key_alias, provider_id), models(display_name, provider_model_id)")
    .eq("user_id", user.id)
    .order("priority", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const POST = withAuth(async ({ user, supabase }, request) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  const { data, error } = await supabase
    .from("model_endpoints")
    .insert({
      api_key_id: body.api_key_id as string,
      model_id: body.model_id as string,
      provider_model_id: body.provider_model_id as string,
      is_available: (body.is_available as boolean) ?? true,
      enabled: (body.enabled as boolean) ?? true,
      priority: (body.priority as number) || 0,
      quota_type: (body.quota_type as string) || "unknown",
      quota_total: (body.quota_total as number) || null,
      quota_used: (body.quota_used as number) || 0,
      reset_cycle: (body.reset_cycle as string) || null,
      reset_date: (body.reset_date as string) || null,
      low_quota_alert: (body.low_quota_alert as number) || null,
      allowed_tasks: body.allowed_tasks as string[] | null || null,
      blocked_tasks: body.blocked_tasks as string[] | null || null,
      health_score: (body.health_score as number) || 100.0,
      notes: (body.notes as string) || null,
      user_id: user.id,
    })
    .select(ENDPOINT_SELECT)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data }, { status: 201 });
});

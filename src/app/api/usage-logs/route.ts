import { NextResponse } from "next/server";
import { withAuth, handleDbError } from "@/lib/api-handler";

export const GET = withAuth(async ({ user, supabase }, request) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "200"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");

  const { data, error } = await supabase
    .from("usage_logs")
    .select("id, user_id, task_run_id, request_type, input_tokens, output_tokens, total_tokens, estimated_cost, actual_cost, latency_ms, status, error_type, http_status, fallback_attempt, created_at, task_runs(task_type, title), models(display_name), api_keys(key_alias), providers(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

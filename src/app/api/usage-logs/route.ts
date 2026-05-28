import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("usage_logs")
    .select("id, user_id, task_run_id, request_type, input_tokens, output_tokens, total_tokens, estimated_cost, actual_cost, latency_ms, status, error_type, http_status, fallback_attempt, created_at, task_runs(task_type, title), models(display_name), api_keys(key_alias), providers(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

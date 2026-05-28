import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("model_endpoints")
    .select("id, user_id, api_key_id, model_id, provider_model_id, is_available, enabled, priority, health_score, success_count, failure_count, consecutive_failures, avg_latency_ms, last_success_at, last_error_at, api_keys(key_alias, provider_id), models(display_name, provider_model_id)")
    .eq("user_id", user.id)
    .order("priority", { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { data, error } = await supabase
    .from("model_endpoints")
    .insert({ ...body, user_id: user.id })
    .select("id, user_id, api_key_id, model_id, provider_model_id, is_available, enabled, priority, health_score, success_count, failure_count, consecutive_failures, avg_latency_ms, last_success_at, last_error_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

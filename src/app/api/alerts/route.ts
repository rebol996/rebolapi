import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAlerts, createAlertsIfNotExist } from "@/lib/alerts/generator";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("alerts")
    .select("id, user_id, type, severity, title, message, entity_type, entity_id, status, created_at, resolved_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const alerts = await generateAlerts(supabase, user.id);
    const created = await createAlertsIfNotExist(supabase, user.id, alerts);

    return NextResponse.json({
      data: {
        checked: alerts.length,
        created,
        alerts: alerts.map((a) => ({
          type: a.type,
          severity: a.severity,
          title: a.title,
        })),
      },
    });
  } catch (err) {
    console.error("Error generating alerts:", err);
    return NextResponse.json({ error: "Failed to generate alerts" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, status } = await request.json();
  const update: Record<string, unknown> = { status };
  if (status === "resolved" || status === "ignored") {
    update.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("alerts")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, user_id, type, severity, title, message, entity_type, entity_id, status, created_at, resolved_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

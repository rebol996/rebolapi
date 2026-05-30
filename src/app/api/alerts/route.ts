import { NextResponse } from "next/server";
import { withAuth, parseJsonBody, handleDbError } from "@/lib/api-handler";
import { generateAlerts, createAlertsIfNotExist } from "@/lib/alerts/generator";

export const GET = withAuth(async ({ user, supabase }, request) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");

  const { data, error } = await supabase
    .from("alerts")
    .select("id, user_id, type, severity, title, message, entity_type, entity_id, status, created_at, resolved_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const POST = withAuth(async ({ user, supabase }) => {
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
});

export const PATCH = withAuth(async ({ user, supabase }, request) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { id, status } = parsed.body as { id: string; status: string };

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

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

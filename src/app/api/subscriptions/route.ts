import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SELECT_FIELDS = "id, user_id, platform, plan_name, alias, account_label, source_type, vendor_url, console_url, price, currency, billing_cycle, purchase_date, renewal_date, expires_at, auto_renew, status, quota_type, quota_total, quota_used, tags, notes, created_at, updated_at";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("subscriptions")
    .select(SELECT_FIELDS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({ ...body, user_id: user.id })
    .select(SELECT_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

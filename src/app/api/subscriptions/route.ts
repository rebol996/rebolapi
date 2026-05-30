import { NextResponse } from "next/server";
import { withAuth, parseJsonBody, handleDbError } from "@/lib/api-handler";

const SELECT_FIELDS = "id, user_id, platform, plan_name, alias, account_label, source_type, vendor_url, console_url, price, currency, billing_cycle, purchase_date, renewal_date, expires_at, auto_renew, status, quota_type, quota_total, quota_used, tags, notes, created_at, updated_at";

export const GET = withAuth(async ({ user, supabase }) => {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(SELECT_FIELDS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const POST = withAuth(async ({ user, supabase }, request) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      platform: body.platform as string,
      plan_name: body.plan_name as string,
      alias: (body.alias as string) || null,
      account_label: (body.account_label as string) || null,
      source_type: (body.source_type as string) || null,
      vendor_url: (body.vendor_url as string) || null,
      console_url: (body.console_url as string) || null,
      price: (body.price as number) || null,
      currency: (body.currency as string) || "USD",
      billing_cycle: (body.billing_cycle as string) || "monthly",
      purchase_date: (body.purchase_date as string) || null,
      renewal_date: (body.renewal_date as string) || null,
      expires_at: (body.expires_at as string) || null,
      auto_renew: (body.auto_renew as boolean) ?? true,
      status: (body.status as string) || "active",
      quota_type: (body.quota_type as string) || "unknown",
      quota_total: (body.quota_total as number) || null,
      quota_used: (body.quota_used as number) || 0,
      tags: body.tags as string[] | null || null,
      notes: (body.notes as string) || null,
      user_id: user.id,
    })
    .select(SELECT_FIELDS)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data }, { status: 201 });
});

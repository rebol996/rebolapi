import { NextResponse } from "next/server";
import { withAuth, parseJsonBody, handleDbError } from "@/lib/api-handler";

const BUDGET_SELECT = "id, user_id, scope, scope_id, period, amount, currency, warning_threshold, hard_limit, status, created_at, updated_at";

export const GET = withAuth(async ({ user, supabase }) => {
  const { data, error } = await supabase
    .from("budgets")
    .select(BUDGET_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const POST = withAuth(async ({ user, supabase }, request) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  const { data, error } = await supabase
    .from("budgets")
    .insert({
      scope: body.scope as string,
      scope_id: (body.scope_id as string) || null,
      period: (body.period as string) || "monthly",
      amount: body.amount as number,
      currency: (body.currency as string) || "USD",
      warning_threshold: (body.warning_threshold as number) || null,
      hard_limit: (body.hard_limit as boolean) ?? true,
      status: (body.status as string) || "active",
      user_id: user.id,
    })
    .select(BUDGET_SELECT)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data }, { status: 201 });
});

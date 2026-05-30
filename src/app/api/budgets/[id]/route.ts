import { NextResponse } from "next/server";
import { withAuthParams, handleDbError } from "@/lib/api-handler";

export const DELETE = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { error } = await supabase.from("budgets").delete().eq("id", id).eq("user_id", user.id);
  if (error) return handleDbError(error);
  return NextResponse.json({ success: true });
});

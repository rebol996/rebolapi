import { NextResponse } from "next/server";
import { withAuth, handleDbError } from "@/lib/api-handler";

export const GET = withAuth(async ({ user, supabase }, request) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  const { data, error } = await supabase
    .from("model_discoveries")
    .select(`
      id, api_key_id, provider_id, status,
      discovered_count, added_count, updated_count, unavailable_count,
      error_message, created_at,
      api_keys ( key_alias ),
      providers ( name )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

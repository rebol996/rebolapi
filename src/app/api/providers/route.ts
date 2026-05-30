import { NextResponse } from "next/server";
import { withAuth, parseJsonBody, handleDbError } from "@/lib/api-handler";

const PROVIDER_SELECT = "id, user_id, name, slug, provider_type, base_url, models_endpoint, chat_endpoint, auth_type, status, notes, created_at, updated_at";

export const GET = withAuth(async ({ user, supabase }) => {
  const { data, error } = await supabase
    .from("providers")
    .select(PROVIDER_SELECT)
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
    .from("providers")
    .insert({
      name: body.name as string,
      slug: body.slug as string,
      provider_type: (body.provider_type as string) || "openai_compatible",
      base_url: body.base_url as string,
      models_endpoint: (body.models_endpoint as string) || "/v1/models",
      chat_endpoint: (body.chat_endpoint as string) || "/v1/chat/completions",
      auth_type: (body.auth_type as string) || "bearer",
      default_headers: body.default_headers as Record<string, string> | null || null,
      status: (body.status as string) || "active",
      notes: (body.notes as string) || null,
      user_id: user.id,
    })
    .select(PROVIDER_SELECT)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data }, { status: 201 });
});

import { NextResponse } from "next/server";
import { withAuth, parseJsonBody, handleDbError } from "@/lib/api-handler";

const MODEL_SELECT = "id, user_id, provider_id, provider_model_id, display_name, family, context_length, input_price, output_price, supports_tools, supports_vision, supports_streaming, quality_level, speed_level, cost_level, notes, created_at, updated_at";

export const GET = withAuth(async ({ user, supabase }) => {
  const { data, error } = await supabase
    .from("models")
    .select(MODEL_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const POST = withAuth(async ({ user, supabase }, request) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  const { data, error } = await supabase
    .from("models")
    .insert({
      provider_id: body.provider_id as string,
      provider_model_id: body.provider_model_id as string,
      display_name: body.display_name as string,
      family: (body.family as string) || null,
      context_length: (body.context_length as number) || null,
      input_price: (body.input_price as number) || null,
      output_price: (body.output_price as number) || null,
      currency: (body.currency as string) || "USD",
      supports_tools: (body.supports_tools as boolean) || false,
      supports_structured_output: (body.supports_structured_output as boolean) || false,
      supports_vision: (body.supports_vision as boolean) || false,
      supports_streaming: (body.supports_streaming as boolean) ?? true,
      quality_level: body.quality_level as number | null || null,
      speed_level: body.speed_level as number | null || null,
      cost_level: body.cost_level as number | null || null,
      task_tags: body.task_tags as string[] | null || null,
      notes: (body.notes as string) || null,
      user_id: user.id,
    })
    .select(MODEL_SELECT)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data }, { status: 201 });
});

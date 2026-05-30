import { NextResponse } from "next/server";
import { withAuthParams, parseJsonBody, pickFields, handleDbError } from "@/lib/api-handler";

const MODEL_SELECT = "id, user_id, provider_id, provider_model_id, display_name, family, context_length, input_price, output_price, supports_tools, supports_vision, supports_streaming, quality_level, speed_level, cost_level, notes, created_at, updated_at";
const ALLOWED_UPDATE_FIELDS = ["display_name", "family", "context_length", "input_price", "output_price", "supports_tools", "supports_structured_output", "supports_vision", "supports_streaming", "quality_level", "speed_level", "cost_level", "task_tags", "notes"];

export const GET = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { data, error } = await supabase
    .from("models")
    .select(MODEL_SELECT)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) return handleDbError(error, 404);
  return NextResponse.json({ data });
});

export const PUT = withAuthParams(async ({ user, supabase }, request, { id }) => {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const update = pickFields(parsed.body, ALLOWED_UPDATE_FIELDS);
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("models")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(MODEL_SELECT)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data });
});

export const DELETE = withAuthParams(async ({ user, supabase }, _req, { id }) => {
  const { error } = await supabase
    .from("models")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return handleDbError(error);
  return NextResponse.json({ success: true });
});

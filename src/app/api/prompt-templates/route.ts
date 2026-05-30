import { NextResponse } from "next/server";
import { withAuth, parseJsonBody, handleDbError } from "@/lib/api-handler";

const TEMPLATE_SELECT = "id, user_id, name, task_type, system_prompt, user_prompt_template, default_strategy, default_temperature, status, notes, created_at, updated_at";

export const GET = withAuth(async ({ user, supabase }) => {
  const { data, error } = await supabase
    .from("prompt_templates")
    .select(TEMPLATE_SELECT)
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
    .from("prompt_templates")
    .insert({
      name: body.name as string,
      task_type: (body.task_type as string) || "custom",
      system_prompt: (body.system_prompt as string) || null,
      user_prompt_template: body.user_prompt_template as string,
      variables: body.variables as string[] | null || null,
      default_strategy: (body.default_strategy as string) || "balanced",
      default_temperature: (body.default_temperature as number) || null,
      default_save_policy: (body.default_save_policy as string) || "metadata_only",
      status: (body.status as string) || "active",
      notes: (body.notes as string) || null,
      user_id: user.id,
    })
    .select(TEMPLATE_SELECT)
    .single();

  if (error) return handleDbError(error);
  return NextResponse.json({ data }, { status: 201 });
});

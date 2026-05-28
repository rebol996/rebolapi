import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/providers";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: apiKey, error: apiKeyError } = await supabase
    .from("api_keys")
    .select("*")
    .eq("id", id)
    .single();

  if (apiKeyError || !apiKey) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  const { data: provider } = await supabase
    .from("providers")
    .select("*")
    .eq("id", apiKey.provider_id)
    .single();

  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  let plaintextKey: string;
  try {
    plaintextKey = decrypt(apiKey.encrypted_key);
  } catch {
    return NextResponse.json({ error: "Failed to decrypt API key" }, { status: 500 });
  }

  const adapter = getAdapter(provider.provider_type as "openai_compatible" | "anthropic" | "gemini" | "custom");
  const baseUrl = apiKey.base_url || provider.base_url;

  let discoveryResult;
  try {
    discoveryResult = await adapter.discoverModels(plaintextKey, baseUrl);
  } catch (err) {
    await supabase.from("model_discoveries").insert({
      user_id: user.id,
      api_key_id: id,
      provider_id: provider.id,
      status: "failed",
      discovered_count: 0,
      added_count: 0,
      updated_count: 0,
      unavailable_count: 0,
      error_message: String(err),
    });
    return NextResponse.json({ error: "Discovery failed", detail: String(err) }, { status: 500 });
  }

  const discoveredModels = discoveryResult.models;
  let addedCount = 0;
  let updatedCount = 0;
  let unavailableCount = 0;

  const existingEndpoints = await supabase
    .from("model_endpoints")
    .select("id, model_id, provider_model_id, is_available")
    .eq("api_key_id", id);

  const existingEndpointMap = new Map(
    (existingEndpoints.data || []).map((e: Record<string, unknown>) => [e.provider_model_id as string, e])
  );

  const seenModelIds = new Set<string>();

  for (const model of discoveredModels) {
    seenModelIds.add(model.id);

    const { data: existingModel } = await supabase
      .from("models")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider_id", provider.id)
      .eq("provider_model_id", model.id)
      .single();

    let modelId: string;

    if (existingModel) {
      modelId = existingModel.id;
      await supabase
        .from("models")
        .update({
          display_name: model.name || model.id,
          context_length: model.context_length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", modelId);
      updatedCount++;
    } else {
      const { data: newModel, error: modelError } = await supabase
        .from("models")
        .insert({
          user_id: user.id,
          provider_id: provider.id,
          provider_model_id: model.id,
          display_name: model.name || model.id,
          context_length: model.context_length,
          supports_streaming: true,
        })
        .select("id")
        .single();

      if (modelError || !newModel) continue;
      modelId = newModel.id;
      addedCount++;
    }

    const existingEndpoint = existingEndpointMap.get(model.id);
    if (existingEndpoint) {
      await supabase
        .from("model_endpoints")
        .update({
          is_available: true,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", (existingEndpoint as Record<string, unknown>).id);
    } else {
      await supabase.from("model_endpoints").insert({
        user_id: user.id,
        api_key_id: id,
        model_id: modelId,
        provider_model_id: model.id,
        is_available: true,
        enabled: true,
        priority: 0,
        health_score: 100.0,
        discovered_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });
    }
  }

  for (const [providerModelId, endpoint] of existingEndpointMap) {
    if (!seenModelIds.has(providerModelId)) {
      await supabase
        .from("model_endpoints")
        .update({ is_available: false })
        .eq("id", (endpoint as Record<string, unknown>).id);
      unavailableCount++;
    }
  }

  await supabase.from("model_discoveries").insert({
    user_id: user.id,
    api_key_id: id,
    provider_id: provider.id,
    status: "success",
    discovered_count: discoveredModels.length,
    added_count: addedCount,
    updated_count: updatedCount,
    unavailable_count: unavailableCount,
    raw_response_summary: discoveryResult.raw,
  });

  await supabase
    .from("api_keys")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({
    data: {
      discovered: discoveredModels.length,
      added: addedCount,
      updated: updatedCount,
      unavailable: unavailableCount,
    },
  });
}

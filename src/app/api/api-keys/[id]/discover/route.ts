import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-handler";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/providers";
import type { ProviderType } from "@/types/database";

export const POST = withAuthParams(async ({ user, supabase }, _req, { id }) => {

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

  const adapter = getAdapter(provider.provider_type as ProviderType);
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
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 });
  }

  const discoveredModels = discoveryResult.models;
  let modelsAdded = 0;
  let modelsUpdated = 0;
  let endpointsAdded = 0;
  let endpointsUpdated = 0;
  let unavailableCount = 0;
  const endpointErrorMessages: string[] = [];

  const existingEndpoints = await supabase
    .from("model_endpoints")
    .select("id, model_id, provider_model_id, is_available")
    .eq("api_key_id", id);

  const existingEndpointMap = new Map(
    (existingEndpoints.data || []).map((e: Record<string, unknown>) => [e.provider_model_id as string, e])
  );

  const seenModelIds = new Set<string>();
  const modelsToUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];
  const endpointsToInsert: Array<Record<string, unknown>> = [];
  const endpointsToUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];
  const existingModelMap = new Map<string, string>();

  // Pre-fetch all existing models for this provider
  const { data: existingModels } = await supabase
    .from("models")
    .select("id, provider_model_id")
    .eq("user_id", user.id)
    .eq("provider_id", provider.id);

  for (const m of existingModels || []) {
    existingModelMap.set(m.provider_model_id as string, m.id as string);
  }

  for (const model of discoveredModels) {
    seenModelIds.add(model.id);
    const existingModelId = existingModelMap.get(model.id);

    let modelId: string;

    if (existingModelId) {
      modelId = existingModelId;
      modelsToUpdate.push({
        id: modelId,
        data: {
          display_name: model.name || model.id,
          context_length: model.context_length,
          updated_at: new Date().toISOString(),
        },
      });
      modelsUpdated++;
    } else {
      // We need to insert and get IDs back. For correctness with new models,
      // insert one-by-one to capture returned IDs (endpoints depend on them).
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

      if (modelError || !newModel) {
        endpointErrorMessages.push(`Model insert failed (${model.id}): ${modelError?.message || "unknown"}`);
        continue;
      }
      modelId = newModel.id;
      modelsAdded++;
    }

    const existingEndpoint = existingEndpointMap.get(model.id);
    if (existingEndpoint) {
      endpointsToUpdate.push({
        id: (existingEndpoint as Record<string, unknown>).id as string,
        data: {
          is_available: true,
          last_seen_at: new Date().toISOString(),
        },
      });
      endpointsUpdated++;
    } else {
      endpointsToInsert.push({
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
      endpointsAdded++;
    }
  }

  // Batch update models
  if (modelsToUpdate.length > 0) {
    const updatePromises = modelsToUpdate.map((m) =>
      supabase.from("models").update(m.data).eq("id", m.id)
    );
    const results = await Promise.allSettled(updatePromises);
    for (const r of results) {
      if (r.status === "rejected") {
        endpointErrorMessages.push(`Model update failed: ${r.reason}`);
      }
    }
  }

  // Batch insert endpoints
  if (endpointsToInsert.length > 0) {
    const { error: epBatchErr } = await supabase.from("model_endpoints").insert(endpointsToInsert);
    if (epBatchErr) {
      endpointErrorMessages.push(`Endpoint batch insert failed: ${epBatchErr.message}`);
    }
  }

  // Batch update endpoints
  if (endpointsToUpdate.length > 0) {
    const updatePromises = endpointsToUpdate.map((e) =>
      supabase.from("model_endpoints").update(e.data).eq("id", e.id)
    );
    const results = await Promise.allSettled(updatePromises);
    for (const r of results) {
      if (r.status === "rejected") {
        endpointErrorMessages.push(`Endpoint update failed: ${r.reason}`);
      }
    }
  }

  // Mark unseen endpoints as unavailable in batch
  const unseenEndpointIds: string[] = [];
  for (const [providerModelId, endpoint] of existingEndpointMap) {
    if (!seenModelIds.has(providerModelId)) {
      unseenEndpointIds.push((endpoint as Record<string, unknown>).id as string);
    }
  }
  if (unseenEndpointIds.length > 0) {
    await supabase
      .from("model_endpoints")
      .update({ is_available: false })
      .in("id", unseenEndpointIds);
  }
  unavailableCount = unseenEndpointIds.length;

  const discoveryStatus = endpointErrorMessages.length > 0 ? "partial" : "success";

  await supabase.from("model_discoveries").insert({
    user_id: user.id,
    api_key_id: id,
    provider_id: provider.id,
    status: discoveryStatus,
    discovered_count: discoveredModels.length,
    added_count: modelsAdded,
    updated_count: modelsUpdated,
    unavailable_count: unavailableCount,
    error_message: endpointErrorMessages.length > 0 ? endpointErrorMessages.join("; ") : null,
    raw_response_summary: discoveryResult.raw,
  });

  await supabase
    .from("api_keys")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({
    data: {
      discovered: discoveredModels.length,
      models_added: modelsAdded,
      models_updated: modelsUpdated,
      endpoints_added: endpointsAdded,
      endpoints_updated: endpointsUpdated,
      endpoint_errors: endpointErrorMessages.length,
      unavailable: unavailableCount,
      errors: endpointErrorMessages.length > 0 ? endpointErrorMessages : undefined,
    },
  });
});

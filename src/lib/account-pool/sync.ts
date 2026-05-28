import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/providers";
import type { ProviderType } from "@/types/database";
import type { User } from "@supabase/supabase-js";

export interface SyncResult {
  success: boolean;
  models_discovered: number;
  models_added: number;
  models_updated: number;
  endpoints_added: number;
  endpoints_updated: number;
  endpoints_unavailable: number;
  endpoint_errors: string[];
  provider_created: boolean;
  api_key_created: boolean;
  error?: string;
}

function detectProviderType(platformName: string, baseUrl: string): ProviderType {
  const lower = (platformName + " " + baseUrl).toLowerCase();
  if (lower.includes("anthropic")) return "anthropic";
  if (lower.includes("gemini") || lower.includes("google")) return "gemini";
  if (lower.includes("openrouter")) return "openrouter";
  return "openai_compatible";
}

export async function syncAccount(
  accountId: string,
  user: User,
): Promise<SyncResult> {
  const supabase = await createClient();

  const result: SyncResult = {
    success: false,
    models_discovered: 0,
    models_added: 0,
    models_updated: 0,
    endpoints_added: 0,
    endpoints_updated: 0,
    endpoints_unavailable: 0,
    endpoint_errors: [],
    provider_created: false,
    api_key_created: false,
  };

  // 1. Read account
  const { data: account, error: accountErr } = await supabase
    .from("account_pool_items")
    .select("*")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single();

  if (accountErr || !account) {
    result.error = "账号不存在";
    return result;
  }

  // 2. Update status to syncing
  await supabase
    .from("account_pool_items")
    .update({ status: "syncing", sync_error: null })
    .eq("id", accountId);

  // 3. Decrypt API key
  let plaintextKey: string;
  try {
    plaintextKey = decrypt(account.encrypted_api_key);
  } catch {
    await supabase
      .from("account_pool_items")
      .update({ status: "invalid", sync_error: "密钥解密失败" })
      .eq("id", accountId);
    result.error = "密钥解密失败";
    return result;
  }

  // 4. Auto-detect provider type
  const providerType = detectProviderType(account.platform_name, account.base_url);

  // 5. Create/update provider
  const providerSlug = `pool-${accountId.slice(0, 8)}`;
  const { data: existingProvider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", providerSlug)
    .single();

  let providerId: string;

  if (existingProvider) {
    providerId = existingProvider.id;
    await supabase
      .from("providers")
      .update({
        name: account.platform_name,
        provider_type: providerType,
        base_url: account.base_url,
        status: "active",
      })
      .eq("id", providerId);
  } else {
    const { data: newProvider, error: provErr } = await supabase
      .from("providers")
      .insert({
        user_id: user.id,
        name: account.platform_name,
        slug: providerSlug,
        provider_type: providerType,
        base_url: account.base_url,
        models_endpoint: providerType === "gemini" ? "/v1beta/models" : "/v1/models",
        chat_endpoint: providerType === "anthropic" ? "/v1/messages" : providerType === "gemini" ? "/v1beta/models" : "/v1/chat/completions",
        auth_type: providerType === "gemini" ? "query" : "bearer",
        status: "active",
      })
      .select("id")
      .single();
    if (provErr || !newProvider) {
      await supabase
        .from("account_pool_items")
        .update({ status: "sync_failed", sync_error: `创建供应商失败: ${provErr?.message || "unknown"}` })
        .eq("id", accountId);
      result.error = `创建供应商失败: ${provErr?.message || "unknown"}`;
      return result;
    }
    providerId = newProvider.id;
    result.provider_created = true;
  }

  // 6. Create/update api_key
  const { data: existingApiKey } = await supabase
    .from("api_keys")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider_id", providerId)
    .eq("key_preview", account.key_preview)
    .single();

  let apiKeyId: string;

  if (existingApiKey) {
    apiKeyId = existingApiKey.id;
    await supabase
      .from("api_keys")
      .update({
        key_alias: account.name,
        base_url: account.base_url,
        status: "active",
      })
      .eq("id", apiKeyId);
  } else {
    const { data: newKey, error: keyErr } = await supabase
      .from("api_keys")
      .insert({
        user_id: user.id,
        provider_id: providerId,
        key_alias: account.name,
        encrypted_key: account.encrypted_api_key,
        key_preview: account.key_preview,
        base_url: account.base_url,
        status: "active",
      })
      .select("id")
      .single();
    if (keyErr || !newKey) {
      await supabase
        .from("account_pool_items")
        .update({ status: "sync_failed", sync_error: `创建 API 密钥失败: ${keyErr?.message || "unknown"}` })
        .eq("id", accountId);
      result.error = `创建 API 密钥失败: ${keyErr?.message || "unknown"}`;
      return result;
    }
    apiKeyId = newKey.id;
    result.api_key_created = true;
  }

  // 7. Discover models
  const adapter = getAdapter(providerType);
  let discoveryResult;
  try {
    discoveryResult = await adapter.discoverModels(plaintextKey, account.base_url);
  } catch (err) {
    await supabase
      .from("account_pool_items")
      .update({ status: "sync_failed", sync_error: `模型发现失败: ${String(err)}` })
      .eq("id", accountId);
    result.error = `模型发现失败: ${String(err)}`;
    return result;
  }

  const discoveredModels = discoveryResult.models;
  result.models_discovered = discoveredModels.length;

  // 8. Upsert models, endpoints, account_discovered_models
  const existingEndpoints = await supabase
    .from("model_endpoints")
    .select("id, model_id, provider_model_id, is_available")
    .eq("api_key_id", apiKeyId);

  const existingEndpointMap = new Map(
    (existingEndpoints.data || []).map((e: Record<string, unknown>) => [e.provider_model_id as string, e])
  );

  const seenModelIds = new Set<string>();

  for (const model of discoveredModels) {
    seenModelIds.add(model.id);

    // Upsert model
    const { data: existingModel } = await supabase
      .from("models")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider_id", providerId)
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
      result.models_updated++;
    } else {
      const { data: newModel, error: modelError } = await supabase
        .from("models")
        .insert({
          user_id: user.id,
          provider_id: providerId,
          provider_model_id: model.id,
          display_name: model.name || model.id,
          context_length: model.context_length,
          supports_streaming: true,
        })
        .select("id")
        .single();
      if (modelError || !newModel) {
        result.endpoint_errors.push(`模型创建失败 (${model.id}): ${modelError?.message || "unknown"}`);
        continue;
      }
      modelId = newModel.id;
      result.models_added++;
    }

    // Upsert endpoint
    const existingEndpoint = existingEndpointMap.get(model.id);
    if (existingEndpoint) {
      await supabase
        .from("model_endpoints")
        .update({ is_available: true, last_seen_at: new Date().toISOString() })
        .eq("id", (existingEndpoint as Record<string, unknown>).id);
      result.endpoints_updated++;
    } else {
      const { error: epErr } = await supabase.from("model_endpoints").insert({
        user_id: user.id,
        api_key_id: apiKeyId,
        model_id: modelId,
        provider_model_id: model.id,
        is_available: true,
        enabled: true,
        priority: 0,
        health_score: 100.0,
        discovered_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });
      if (epErr) {
        result.endpoint_errors.push(`端点创建失败 (${model.id}): ${epErr.message}`);
      } else {
        result.endpoints_added++;
      }
    }

    // Upsert account_discovered_models
    const { data: existingAdm } = await supabase
      .from("account_discovered_models")
      .select("id")
      .eq("account_id", accountId)
      .eq("provider_model_id", model.id)
      .single();

    if (existingAdm) {
      await supabase
        .from("account_discovered_models")
        .update({
          display_name: model.name || model.id,
          context_length: model.context_length,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existingAdm.id);
    } else {
      await supabase.from("account_discovered_models").insert({
        account_id: accountId,
        user_id: user.id,
        provider_model_id: model.id,
        display_name: model.name || model.id,
        context_length: model.context_length,
        last_seen_at: new Date().toISOString(),
      });
    }
  }

  // 9. Mark unseen endpoints unavailable
  for (const [providerModelId, endpoint] of existingEndpointMap) {
    if (!seenModelIds.has(providerModelId)) {
      await supabase
        .from("model_endpoints")
        .update({ is_available: false })
        .eq("id", (endpoint as Record<string, unknown>).id);
      result.endpoints_unavailable++;
    }
  }

  // 10. Insert snapshot
  let rawSnapshot: Record<string, unknown> | null = null;
  if (discoveryResult.raw) {
    try { rawSnapshot = JSON.parse(discoveryResult.raw); } catch { rawSnapshot = { raw: discoveryResult.raw }; }
  }
  await supabase.from("account_asset_snapshots").insert({
    account_id: accountId,
    user_id: user.id,
    raw_snapshot: rawSnapshot,
  });

  // 11. Update account status
  const finalStatus = result.endpoint_errors.length > 0 ? "active" : "active";
  await supabase
    .from("account_pool_items")
    .update({
      status: finalStatus,
      last_sync_at: new Date().toISOString(),
      sync_error: result.endpoint_errors.length > 0 ? result.endpoint_errors.join("; ") : null,
    })
    .eq("id", accountId);

  result.success = true;
  return result;
}

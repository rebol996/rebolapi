import { NextResponse } from "next/server";
import { withAuth, handleDbError } from "@/lib/api-handler";

export const GET = withAuth(async ({ user, supabase }) => {
  const { data, error } = await supabase
    .from("model_endpoints")
    .select(`
      id, provider_model_id, enabled, is_available, priority, health_score,
      success_count, failure_count, avg_latency_ms, last_seen_at,
      models(display_name, supports_vision, supports_streaming, context_length),
      api_keys(key_alias, provider_id, providers(name, provider_type, base_url))
    `)
    .eq("user_id", user.id)
    .order("priority", { ascending: false })
    .limit(300);

  if (error) return handleDbError(error);

  // Enrich with account pool info
  const enriched = await Promise.all(
    (data || []).map(async (ep) => {
      const apiKey = ep.api_keys as unknown as Record<string, unknown> | null;
      const provider = (apiKey?.providers ?? null) as unknown as Record<string, unknown> | null;
      const model = ep.models as unknown as Record<string, unknown> | null;

      // Try to find the source account pool item
      let assetName: string | null = null;
      if (apiKey?.provider_id) {
        const { data: account } = await supabase
          .from("account_pool_items")
          .select("name")
          .eq("user_id", user.id)
          .like("base_url", `%${(provider?.base_url as string || "").replace(/https?:\/\//, "").split("/")[0]}%`)
          .limit(1)
          .single();
        assetName = account?.name || null;
      }

      return {
        id: ep.id,
        provider_model_id: ep.provider_model_id,
        display_name: (model?.display_name as string) || ep.provider_model_id,
        supports_vision: (model?.supports_vision as boolean) || false,
        supports_streaming: (model?.supports_streaming as boolean) || false,
        context_length: (model?.context_length as number) || null,
        platform_name: (provider?.name as string) || "—",
        platform_type: (provider?.provider_type as string) || "—",
        asset_name: assetName,
        key_alias: (apiKey?.key_alias as string) || "—",
        enabled: ep.enabled,
        is_available: ep.is_available,
        priority: ep.priority,
        health_score: ep.health_score,
        success_count: ep.success_count,
        failure_count: ep.failure_count,
        avg_latency_ms: ep.avg_latency_ms,
        last_seen_at: ep.last_seen_at,
      };
    })
  );

  return NextResponse.json({ data: enriched });
});

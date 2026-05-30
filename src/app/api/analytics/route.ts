import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import {
  getCostSummary,
  getCostByProvider,
  getCostByModel,
  getCostBySubscription,
  getCostByTaskType,
  getCostTrend,
  getEndpointHealthRanking,
  getUpcomingRenewals,
  getModelUsageRanking,
} from "@/lib/analytics/cost-aggregator";
import { getCachedData, setCachedData, generateCacheKey, CACHE_TTL } from "@/lib/cache";

export const GET = withAuth(async ({ user, supabase }, request) => {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "summary";
  const period = (searchParams.get("period") || "monthly") as "daily" | "weekly" | "monthly" | "yearly";
  const days = parseInt(searchParams.get("days") || "30");

  const cacheKey = generateCacheKey("analytics", user.id, type, period, days);
  const cached = getCachedData(cacheKey);
  if (cached) {
    return NextResponse.json({ data: cached, cached: true });
  }

  try {
    let data;

    switch (type) {
      case "summary":
        data = await getCostSummary(supabase, user.id, period);
        break;
      case "by-provider":
        data = await getCostByProvider(supabase, user.id, days);
        break;
      case "by-model":
        data = await getCostByModel(supabase, user.id, days);
        break;
      case "by-subscription":
        data = await getCostBySubscription(supabase, user.id, days);
        break;
      case "by-task-type":
        data = await getCostByTaskType(supabase, user.id, days);
        break;
      case "trend":
        data = await getCostTrend(supabase, user.id, days);
        break;
      case "endpoint-health":
        data = await getEndpointHealthRanking(supabase, user.id);
        break;
      case "upcoming-renewals":
        data = await getUpcomingRenewals(supabase, user.id, days);
        break;
      case "model-ranking":
        data = await getModelUsageRanking(supabase, user.id, days);
        break;
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    setCachedData(cacheKey, data, CACHE_TTL.MEDIUM);

    return NextResponse.json({ data });
  } catch (err) {
    console.error("Analytics error:", err);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
});

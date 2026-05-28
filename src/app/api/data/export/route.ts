import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "json";
  const type = searchParams.get("type") || "full";
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");
  const includeMetadata = searchParams.get("include_metadata") !== "false";

  const tables = getTablesForType(type);

  const backup: Record<string, unknown> = {
    export_date: new Date().toISOString(),
    type,
    filters: {
      start_date: startDate || null,
      end_date: endDate || null,
    },
  };

  for (const table of tables) {
    let query = supabase.from(table).select("*").eq("user_id", user.id);

    if (startDate && hasDateColumn(table)) {
      query = query.gte("created_at", startDate);
    }
    if (endDate && hasDateColumn(table)) {
      query = query.lte("created_at", endDate);
    }

    const { data, error } = await query;
    if (!error) {
      if (!includeMetadata && table !== "usage_logs") {
        backup[table] = (data || []).map((row: Record<string, unknown>) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { user_id, created_at, updated_at, ...rest } = row;
          return rest;
        });
      } else {
        backup[table] = data;
      }
    }
  }

  if (type === "cost_report") {
    backup.cost_summary = await generateCostReport(supabase, user.id, startDate, endDate);
  }

  if (format === "csv") {
    const csv = convertToCsv(backup, type);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="rebol-api-${type}-${Date.now()}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="rebol-api-${type}-${Date.now()}.json"`,
    },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { type = "full", data: importData } = body;

  if (!importData || typeof importData !== "object") {
    return NextResponse.json({ error: "Invalid import data" }, { status: 400 });
  }

  const results: Record<string, { imported: number; errors: number; skipped: number }> = {};
  const tables = getTablesForType(type);

  for (const table of tables) {
    const rows = importData[table];
    if (!Array.isArray(rows)) continue;

    let imported = 0;
    let errors = 0;
    let skipped = 0;

    for (const row of rows) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, created_at, updated_at, user_id: rowUserId, ...rest } = row;

      if (type !== "full" && !validateRow(table, rest)) {
        skipped++;
        continue;
      }

      const { error } = await supabase
        .from(table)
        .upsert({ ...rest, user_id: user.id }, { onConflict: "id" });
      if (error) errors++;
      else imported++;
    }

    results[table] = { imported, errors, skipped };
  }

  return NextResponse.json({ data: results });
}

function getTablesForType(type: string): string[] {
  switch (type) {
    case "subscriptions":
      return ["subscriptions"];
    case "usage_logs":
      return ["usage_logs"];
    case "billing":
      return ["subscriptions", "usage_logs", "budgets"];
    case "prompt_templates":
      return ["prompt_templates"];
    case "provider_config":
      return ["providers"];
    case "cost_report":
      return ["usage_logs", "subscriptions", "budgets"];
    case "full":
    default:
      return [
        "providers",
        "subscriptions",
        "api_keys",
        "models",
        "model_endpoints",
        "prompt_templates",
        "budgets",
        "gateway_tokens",
      ];
  }
}

function hasDateColumn(table: string): boolean {
  return ["usage_logs", "task_runs", "alerts", "model_discoveries"].includes(table);
}

function validateRow(table: string, row: Record<string, unknown>): boolean {
  switch (table) {
    case "subscriptions":
      return !!(row.platform && row.plan_name);
    case "providers":
      return !!(row.name && row.slug && row.base_url);
    case "prompt_templates":
      return !!(row.name && row.user_prompt_template);
    case "budgets":
      return !!(row.scope && row.amount);
    default:
      return true;
  }
}

interface CostReportSummary {
  period: {
    start: string | null;
    end: string | null;
  };
  total_api_cost: number;
  total_subscription_cost: number;
  total_cost: number;
  total_calls: number;
  avg_cost_per_call: number;
  cost_by_provider: Array<{
    provider_name: string;
    total_cost: number;
    call_count: number;
  }>;
  cost_by_model: Array<{
    model_name: string;
    provider_name: string;
    total_cost: number;
    call_count: number;
  }>;
  daily_breakdown: Array<{
    date: string;
    cost: number;
    calls: number;
  }>;
}

async function generateCostReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  startDate: string | null,
  endDate: string | null
): Promise<CostReportSummary> {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end = endDate || new Date().toISOString();

  const { data: usageLogs } = await supabase
    .from("usage_logs")
    .select("estimated_cost, provider_id, model_id, created_at, input_tokens, output_tokens")
    .eq("user_id", userId)
    .gte("created_at", start)
    .lte("created_at", end);

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("price, billing_cycle")
    .eq("user_id", userId)
    .eq("status", "active");

  const { data: providers } = await supabase
    .from("providers")
    .select("id, name")
    .eq("user_id", userId);

  const { data: models } = await supabase
    .from("models")
    .select("id, display_name, provider_id")
    .eq("user_id", userId);

  const providerMap = new Map<string, string>();
  if (providers) {
    for (const p of providers) {
      providerMap.set(p.id, p.name);
    }
  }

  const modelMap = new Map<string, { name: string; provider_id: string }>();
  if (models) {
    for (const m of models) {
      modelMap.set(m.id, { name: m.display_name, provider_id: m.provider_id });
    }
  }

  let totalApiCost = 0;
  const costByProvider = new Map<string, { cost: number; count: number }>();
  const costByModel = new Map<string, { cost: number; count: number; provider_name: string }>();
  const dailyBreakdown = new Map<string, { cost: number; calls: number }>();

  if (usageLogs) {
    for (const log of usageLogs) {
      const cost = log.estimated_cost || 0;
      totalApiCost += cost;

      const providerName = providerMap.get(log.provider_id) || "Unknown";
      const providerStats = costByProvider.get(providerName) || { cost: 0, count: 0 };
      providerStats.cost += cost;
      providerStats.count += 1;
      costByProvider.set(providerName, providerStats);

      const modelInfo = modelMap.get(log.model_id);
      const modelName = modelInfo?.name || "Unknown";
      const modelProviderName = modelInfo ? providerMap.get(modelInfo.provider_id) || "Unknown" : "Unknown";
      const modelKey = `${modelName} (${modelProviderName})`;
      const modelStats = costByModel.get(modelKey) || { cost: 0, count: 0, provider_name: modelProviderName };
      modelStats.cost += cost;
      modelStats.count += 1;
      costByModel.set(modelKey, modelStats);

      const date = new Date(log.created_at).toISOString().split("T")[0];
      const dailyStats = dailyBreakdown.get(date) || { cost: 0, calls: 0 };
      dailyStats.cost += cost;
      dailyStats.calls += 1;
      dailyBreakdown.set(date, dailyStats);
    }
  }

  let totalSubscriptionCost = 0;
  if (subscriptions) {
    for (const sub of subscriptions) {
      if (sub.price) {
        switch (sub.billing_cycle) {
          case "monthly":
            totalSubscriptionCost += sub.price;
            break;
          case "yearly":
            totalSubscriptionCost += sub.price / 12;
            break;
          case "one_time":
            totalSubscriptionCost += sub.price / 12;
            break;
        }
      }
    }
  }

  const totalCalls = usageLogs?.length || 0;

  return {
    period: { start, end },
    total_api_cost: totalApiCost,
    total_subscription_cost: totalSubscriptionCost,
    total_cost: totalApiCost + totalSubscriptionCost,
    total_calls: totalCalls,
    avg_cost_per_call: totalCalls > 0 ? totalApiCost / totalCalls : 0,
    cost_by_provider: Array.from(costByProvider.entries()).map(([name, stats]) => ({
      provider_name: name,
      total_cost: stats.cost,
      call_count: stats.count,
    })).sort((a, b) => b.total_cost - a.total_cost),
    cost_by_model: Array.from(costByModel.entries()).map(([key, stats]) => ({
      model_name: key.split(" (")[0],
      provider_name: stats.provider_name,
      total_cost: stats.cost,
      call_count: stats.count,
    })).sort((a, b) => b.total_cost - a.total_cost),
    daily_breakdown: Array.from(dailyBreakdown.entries()).map(([date, stats]) => ({
      date,
      cost: stats.cost,
      calls: stats.calls,
    })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function convertToCsv(data: Record<string, unknown>, type: string): string {
  const rows = data[type] || data[Object.keys(data).find((k) => k !== "export_date" && k !== "type" && k !== "filters" && k !== "cost_summary") || ""] || [];
  if (!Array.isArray(rows) || rows.length === 0) return "";

  const headers = Object.keys(rows[0]).filter((k) => k !== "user_id");
  const lines = [headers.join(",")];

  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      if (typeof val === "string" && (val.includes(",") || val.includes('"') || val.includes("\n"))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return String(val);
    });
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

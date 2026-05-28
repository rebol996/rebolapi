import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AlertCheckButton } from "@/components/alert-check-button";
import {
  CostSummaryCard,
  UpcomingRenewalsCard,
  EndpointHealthCard,
  RecentTaskRunsCard,
} from "@/components/dashboard/analytics-cards";
import { CostTrendChart, ProviderCostChart } from "@/components/charts/cost-trend-chart";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [
    { data: subscriptions },
    { data: apiKeys },
    { data: endpoints },
    { data: alerts },
  ] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase
      .from("api_keys")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase
      .from("model_endpoints")
      .select("*")
      .eq("user_id", user.id)
      .eq("enabled", true)
      .eq("is_available", true),
    supabase
      .from("alerts")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const activeEndpoints = endpoints || [];
  const totalHealth = activeEndpoints.length > 0
    ? activeEndpoints.reduce((sum: number, e: Record<string, unknown>) => sum + (e.health_score as number || 0), 0) / activeEndpoints.length
    : 0;

  const criticalAlerts = alerts?.filter((a: Record<string, unknown>) => a.severity === "critical").length || 0;
  const warningAlerts = alerts?.filter((a: Record<string, unknown>) => a.severity === "warning").length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">仪表盘</h1>
        <div className="flex items-center gap-3">
          <AlertCheckButton />
          <span className="text-sm text-gray-500">{user.email}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="有效订阅" value={String(subscriptions?.length || 0)} />
        <StatCard label="有效 API 密钥" value={String(apiKeys?.length || 0)} />
        <StatCard label="可用端点" value={String(endpoints?.length || 0)} />
        <StatCard label="平均健康分" value={totalHealth.toFixed(1)} suffix="%" />
      </div>

      {(criticalAlerts > 0 || warningAlerts > 0) && (
        <div className="flex gap-3">
          {criticalAlerts > 0 && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-2">
              <span className="text-red-300 text-sm font-medium">{criticalAlerts} 个严重告警</span>
            </div>
          )}
          {warningAlerts > 0 && (
            <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg px-4 py-2">
              <span className="text-yellow-300 text-sm font-medium">{warningAlerts} 个警告</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-4">成本趋势（30 天）</h2>
          <CostTrendChart days={30} height={250} />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-4">按供应商统计成本</h2>
          <ProviderCostChart days={30} height={250} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <CostSummaryCard />
        <UpcomingRenewalsCard />
        <EndpointHealthCard />
        <RecentTaskRunsCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">未处理告警</h2>
          {(!alerts || alerts.length === 0) ? (
            <p className="text-sm text-gray-500">暂无未处理告警</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert: Record<string, unknown>) => (
                <div key={alert.id as string} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        (alert.severity as string) === "critical" ? "bg-red-900/50 text-red-300" :
                        (alert.severity as string) === "warning" ? "bg-yellow-900/50 text-yellow-300" :
                        "bg-blue-900/50 text-blue-300"
                      }`}>{alert.severity as string}</span>
                      <span className="text-sm text-white truncate">{alert.title as string}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">{alert.message as string}</p>
                  </div>
                  <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">{new Date(alert.created_at as string).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">快捷操作</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/chat" prefetch className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg p-3 text-center transition-colors">
              <span className="text-2xl block mb-1">💬</span>
              <span className="text-sm text-white">新建聊天</span>
            </Link>
            <Link href="/workspace" prefetch className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg p-3 text-center transition-colors">
              <span className="text-2xl block mb-1">🛠️</span>
              <span className="text-sm text-white">工作台</span>
            </Link>
            <Link href="/api-keys" prefetch className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg p-3 text-center transition-colors">
              <span className="text-2xl block mb-1">🔑</span>
              <span className="text-sm text-white">API 密钥</span>
            </Link>
            <Link href="/usage-logs" prefetch className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg p-3 text-center transition-colors">
              <span className="text-2xl block mb-1">📊</span>
              <span className="text-sm text-white">用量日志</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">
        {value}
        {suffix && <span className="text-sm text-gray-400 ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}

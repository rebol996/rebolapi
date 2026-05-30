"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { formatDateTime } from "@/lib/ui-labels";

interface UsageLog {
  id: string;
  created_at: string;
  request_type: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost: number | null;
  latency_ms: number | null;
  status: string;
  models?: { display_name: string };
  api_keys?: { key_alias: string };
  providers?: { name: string };
  gateway_token_id: string | null;
}

interface Summary {
  todayRequests: number;
  monthRequests: number;
  todayTokens: number;
  monthTokens: number;
  todayCost: number;
  monthCost: number;
}

export default function ConsumptionPage() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (force = false) => {
    try {
      setLoadError(null);
      const json = await cachedJson<{ data?: UsageLog[] }>("/api/usage-logs", { force });
      setLogs(json.data || []);
    } catch (err) {
      setLoadError("加载消耗数据失败：" + String(err));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const summary: Summary = { todayRequests: 0, monthRequests: 0, todayTokens: 0, monthTokens: 0, todayCost: 0, monthCost: 0 };
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const monthStr = todayStr.slice(0, 7);

  for (const log of logs) {
    const logDate = log.created_at.split("T")[0];
    const logMonth = logDate.slice(0, 7);
    if (logDate === todayStr) {
      summary.todayRequests++;
      summary.todayTokens += log.total_tokens || 0;
      summary.todayCost += log.estimated_cost || 0;
    }
    if (logMonth === monthStr) {
      summary.monthRequests++;
      summary.monthTokens += log.total_tokens || 0;
      summary.monthCost += log.estimated_cost || 0;
    }
  }

  // Group by model
  const byModel: Record<string, { requests: number; tokens: number; cost: number }> = {};
  for (const log of logs) {
    const name = log.models?.display_name || "未知";
    if (!byModel[name]) byModel[name] = { requests: 0, tokens: 0, cost: 0 };
    byModel[name].requests++;
    byModel[name].tokens += log.total_tokens || 0;
    byModel[name].cost += log.estimated_cost || 0;
  }
  const modelEntries = Object.entries(byModel).sort((a, b) => b[1].requests - a[1].requests).slice(0, 20);

  if (loading) return <div className="text-gray-400">加载中...</div>;
  if (loadError) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">消耗统计</h1>
      <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{loadError}</div>
      <button onClick={() => load(true)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">重试</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">消耗统计</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400">今日请求</p>
          <p className="text-2xl font-bold text-white mt-1">{summary.todayRequests}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400">本月请求</p>
          <p className="text-2xl font-bold text-white mt-1">{summary.monthRequests}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400">今日 Token</p>
          <p className="text-2xl font-bold text-white mt-1">{summary.todayTokens.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400">本月 Token</p>
          <p className="text-2xl font-bold text-white mt-1">{summary.monthTokens.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400">今日费用</p>
          <p className="text-2xl font-bold text-white mt-1">${summary.todayCost.toFixed(4)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400">本月费用</p>
          <p className="text-2xl font-bold text-white mt-1">${summary.monthCost.toFixed(4)}</p>
        </div>
      </div>

      {modelEntries.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">按模型统计</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-800">
                <th className="text-left py-2 px-3 text-gray-400 font-medium">模型</th>
                <th className="text-right py-2 px-3 text-gray-400 font-medium">请求</th>
                <th className="text-right py-2 px-3 text-gray-400 font-medium">Token</th>
                <th className="text-right py-2 px-3 text-gray-400 font-medium">费用</th>
              </tr></thead>
              <tbody>
                {modelEntries.map(([name, stats]) => (
                  <tr key={name} className="border-b border-gray-800/50">
                    <td className="py-2 px-3 text-white">{name}</td>
                    <td className="py-2 px-3 text-gray-400 text-right">{stats.requests}</td>
                    <td className="py-2 px-3 text-gray-400 text-right">{stats.tokens.toLocaleString()}</td>
                    <td className="py-2 px-3 text-gray-400 text-right">${stats.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-300 mb-3">最近调用</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-800">
              <th className="text-left py-2 px-3 text-gray-400 font-medium">时间</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">模型</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">供应商</th>
              <th className="text-right py-2 px-3 text-gray-400 font-medium">Token</th>
              <th className="text-right py-2 px-3 text-gray-400 font-medium">费用</th>
              <th className="text-right py-2 px-3 text-gray-400 font-medium">延迟</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">状态</th>
            </tr></thead>
            <tbody>
              {logs.slice(0, 50).map((log) => (
                <tr key={log.id} className="border-b border-gray-800/50">
                  <td className="py-2 px-3 text-gray-400 text-xs">{formatDateTime(log.created_at)}</td>
                  <td className="py-2 px-3 text-white text-xs">{log.models?.display_name || "—"}</td>
                  <td className="py-2 px-3 text-gray-400 text-xs">{log.providers?.name || "—"}</td>
                  <td className="py-2 px-3 text-gray-400 text-right text-xs">{log.total_tokens || 0}</td>
                  <td className="py-2 px-3 text-gray-400 text-right text-xs">${(log.estimated_cost || 0).toFixed(4)}</td>
                  <td className="py-2 px-3 text-gray-400 text-right text-xs">{log.latency_ms ? `${log.latency_ms}ms` : "—"}</td>
                  <td className="py-2 px-3"><span className={`text-xs px-1.5 py-0.5 rounded ${log.status === "success" ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"}`}>{log.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && <p className="text-gray-500 text-sm mt-4">暂无调用记录。</p>}
        </div>
      </div>
    </div>
  );
}

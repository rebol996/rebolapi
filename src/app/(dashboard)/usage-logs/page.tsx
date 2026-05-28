"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { formatDateTime, labelFor } from "@/lib/ui-labels";

interface UsageLog {
  id: string;
  task_run_id: string;
  request_type: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  latency_ms: number | null;
  status: string;
  error_type: string | null;
  http_status: number | null;
  fallback_attempt: number;
  created_at: string;
  models?: { display_name: string };
  api_keys?: { key_alias: string };
  providers?: { name: string };
}

export default function UsageLogsPage() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const json = await cachedJson<{ data?: UsageLog[] }>("/api/usage-logs");
    setLogs(json.data || []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  if (loading) return <div className="text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">用量日志</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-2 px-3 text-gray-400 font-medium">时间</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">模型</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">密钥</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">输入/输出 Token</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">成本</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">延迟</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 px-3 text-gray-400 text-xs">{formatDateTime(l.created_at)}</td>
                <td className="py-2 px-3 text-white">{l.models?.display_name || "—"}</td>
                <td className="py-2 px-3 text-gray-400 text-xs">{l.api_keys?.key_alias || "—"}</td>
                <td className="py-2 px-3 text-gray-400">{l.input_tokens || 0}/{l.output_tokens || 0}</td>
                <td className="py-2 px-3 text-gray-400">${((l.estimated_cost || 0)).toFixed(6)}</td>
                <td className="py-2 px-3 text-gray-400">{l.latency_ms ? `${l.latency_ms}ms` : "—"}</td>
                <td className="py-2 px-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    l.status === "success" ? "bg-green-900/50 text-green-300" :
                    l.status === "error" ? "bg-red-900/50 text-red-300" :
                    "bg-gray-800 text-gray-400"
                  }`}>{labelFor(l.status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="text-gray-500 text-sm mt-4">暂无用量日志。</p>}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";

interface ModelEndpoint {
  id: string;
  api_key_id: string;
  model_id: string;
  provider_model_id: string;
  is_available: boolean;
  enabled: boolean;
  priority: number;
  health_score: number;
  success_count: number;
  failure_count: number;
  consecutive_failures: number;
  avg_latency_ms: number | null;
  last_success_at: string | null;
  last_error_at: string | null;
  api_keys?: { key_alias: string };
  models?: { display_name: string; provider_model_id: string };
}

export default function ModelEndpointsPage() {
  const [items, setItems] = useState<ModelEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (force = false) => {
    try {
      setLoadError(null);
      const json = await cachedJson<{ data?: ModelEndpoint[] }>("/api/model-endpoints", { force });
      setItems(json.data || []);
    } catch (err) {
      setLoadError("加载端点失败：" + String(err));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/model-endpoints/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        alert("操作失败：" + (json.error || "未知错误"));
        return;
      }
      load(true);
    } catch (err) {
      alert("操作失败：" + String(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return;
    try {
      const res = await fetch(`/api/model-endpoints/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || json.error) {
        alert("删除失败：" + (json.error || "未知错误"));
        return;
      }
      load(true);
    } catch (err) {
      alert("删除失败：" + String(err));
    }
  };

  if (loading) return <div className="text-gray-400">加载中...</div>;
  if (loadError) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">模型端点</h1>
      <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{loadError}</div>
      <button onClick={() => load(true)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">重试</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">模型端点</h1>
      <p className="text-sm text-gray-500">模型端点 = API 密钥 + 模型。通过模型发现自动创建。</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-2 px-3 text-gray-400 font-medium">模型</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">API 密钥</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">可用</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">启用</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">健康度</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">成功/失败</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">平均延迟</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">优先级</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 px-3">
                  <div className="text-white">{e.models?.display_name || e.provider_model_id}</div>
                  <div className="text-xs text-gray-500 font-mono">{e.provider_model_id}</div>
                </td>
                <td className="py-2 px-3 text-gray-400">{e.api_keys?.key_alias || "—"}</td>
                <td className="py-2 px-3"><span className={`text-xs px-1.5 py-0.5 rounded ${e.is_available ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"}`}>{e.is_available ? "是" : "否"}</span></td>
                <td className="py-2 px-3"><span className={`text-xs px-1.5 py-0.5 rounded ${e.enabled ? "bg-blue-900/50 text-blue-300" : "bg-gray-800 text-gray-500"}`}>{e.enabled ? "开启" : "关闭"}</span></td>
                <td className="py-2 px-3"><span className={`text-sm ${e.health_score >= 80 ? "text-green-400" : e.health_score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{e.health_score.toFixed(0)}</span></td>
                <td className="py-2 px-3 text-gray-400">{e.success_count}/{e.failure_count}</td>
                <td className="py-2 px-3 text-gray-400">{e.avg_latency_ms ? `${e.avg_latency_ms}ms` : "—"}</td>
                <td className="py-2 px-3 text-gray-400">{e.priority}</td>
                <td className="py-2 px-3">
                  <div className="flex gap-1">
                    <button onClick={() => handleToggle(e.id, e.enabled)} className="text-xs text-blue-400 hover:text-blue-300">{e.enabled ? "停用" : "启用"}</button>
                    <button onClick={() => handleDelete(e.id)} className="text-xs text-gray-500 hover:text-red-400 ml-2">删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="text-gray-500 text-sm mt-4">暂无端点。请在 API 密钥页重新发现模型。</p>}
      </div>
    </div>
  );
}

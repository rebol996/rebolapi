"use client";

import { useState, useEffect, useMemo } from "react";
import { cachedJson } from "@/lib/client/api-cache";

interface AssetModel {
  id: string;
  provider_model_id: string;
  display_name: string;
  supports_vision: boolean;
  supports_streaming: boolean;
  context_length: number | null;
  platform_name: string;
  platform_type: string;
  asset_name: string | null;
  key_alias: string;
  enabled: boolean;
  is_available: boolean;
  priority: number;
  health_score: number;
  success_count: number;
  failure_count: number;
  avg_latency_ms: number | null;
  last_seen_at: string | null;
}

export default function AssetModelsPage() {
  const [items, setItems] = useState<AssetModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = async (force = false) => {
    try {
      setLoadError(null);
      const json = await cachedJson<{ data?: AssetModel[] }>("/api/asset-models", { force });
      setItems(json.data || []);
    } catch (err) {
      setLoadError("加载模型失败：" + String(err));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return items.filter((m) => {
      if (search) {
        const q = search.toLowerCase();
        const haystack = [m.provider_model_id, m.display_name, m.platform_name, m.asset_name, m.key_alias].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filterStatus === "available" && (!m.enabled || !m.is_available)) return false;
      if (filterStatus === "disabled" && m.enabled) return false;
      if (filterStatus === "unavailable" && m.is_available) return false;
      return true;
    });
  }, [items, search, filterStatus]);

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/model-endpoints/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) { alert("操作失败"); return; }
      load(true);
    } catch (err) {
      alert("操作失败：" + String(err));
    }
  };

  if (loading) return <div className="text-gray-400">加载中...</div>;
  if (loadError) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">模型目录</h1>
      <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{loadError}</div>
      <button onClick={() => load(true)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">重试</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">模型目录</h1>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex flex-col sm:flex-row gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模型 ID、显示名、平台..." className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm min-w-0" />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          <option value="">全部状态</option>
          <option value="available">可用</option>
          <option value="disabled">已禁用</option>
          <option value="unavailable">不可用</option>
        </select>
      </div>

      <div className="text-xs text-gray-500">共 {filtered.length} 个模型</div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-2 px-3 text-gray-400 font-medium">模型</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">平台</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">来源</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">能力</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">状态</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">健康</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">成功率</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 px-3">
                  <div className="text-white">{m.display_name}</div>
                  <div className="text-xs text-gray-500 font-mono">{m.provider_model_id}</div>
                </td>
                <td className="py-2 px-3 text-gray-400 text-xs">{m.platform_name}</td>
                <td className="py-2 px-3 text-gray-400 text-xs">{m.asset_name || m.key_alias}</td>
                <td className="py-2 px-3">
                  <div className="flex gap-1 flex-wrap">
                    {m.supports_streaming && <span className="text-xs bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded">流式</span>}
                    {m.supports_vision && <span className="text-xs bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded">视觉</span>}
                    {m.context_length && <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{(m.context_length / 1000).toFixed(0)}k</span>}
                  </div>
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${m.enabled && m.is_available ? "bg-green-900/50 text-green-300" : "bg-gray-800 text-gray-500"}`}>
                      {m.enabled ? (m.is_available ? "可用" : "不可用") : "禁用"}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-3"><span className={`text-sm ${m.health_score >= 80 ? "text-green-400" : m.health_score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{m.health_score.toFixed(0)}</span></td>
                <td className="py-2 px-3 text-gray-400 text-xs">{m.success_count}/{m.success_count + m.failure_count}</td>
                <td className="py-2 px-3">
                  <button onClick={() => handleToggle(m.id, m.enabled)} className="text-xs text-blue-400 hover:text-blue-300">
                    {m.enabled ? "停用" : "启用"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-gray-500 text-sm mt-4">暂无模型。请先在资产页同步。</p>}
      </div>
    </div>
  );
}

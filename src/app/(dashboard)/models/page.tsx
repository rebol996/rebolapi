"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";

interface Model {
  id: string;
  provider_id: string;
  provider_model_id: string;
  display_name: string;
  family: string | null;
  context_length: number | null;
  input_price: number | null;
  output_price: number | null;
  supports_tools: boolean;
  supports_vision: boolean;
  supports_streaming: boolean;
  quality_level: number | null;
  speed_level: number | null;
  cost_level: number | null;
  notes: string | null;
}

export default function ModelsPage() {
  const [items, setItems] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (force = false) => {
    try {
      setLoadError(null);
      const json = await cachedJson<{ data?: Model[] }>("/api/models", { force });
      setItems(json.data || []);
    } catch (err) {
      setLoadError("加载模型失败：" + String(err));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return;
    try {
      const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
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
      <h1 className="text-2xl font-bold text-white">模型</h1>
      <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{loadError}</div>
      <button onClick={() => load(true)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">重试</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">模型</h1>
      <p className="text-sm text-gray-500">模型通过 API 密钥自动发现。请先添加供应商和 API 密钥，然后使用&ldquo;发现模型&rdquo;。</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-2 px-3 text-gray-400 font-medium">名称</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">模型 ID</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">上下文</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">输入价格</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">输出价格</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">能力</th>
              <th className="text-left py-2 px-3 text-gray-400 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 px-3 text-white">{m.display_name}</td>
                <td className="py-2 px-3 text-gray-400 font-mono text-xs">{m.provider_model_id}</td>
                <td className="py-2 px-3 text-gray-400">{m.context_length?.toLocaleString()}</td>
                <td className="py-2 px-3 text-gray-400">{m.input_price ?? "-"}</td>
                <td className="py-2 px-3 text-gray-400">{m.output_price ?? "-"}</td>
                <td className="py-2 px-3">
                  <div className="flex gap-1 flex-wrap">
                    {m.supports_tools && <span className="text-xs bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded">工具</span>}
                    {m.supports_vision && <span className="text-xs bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded">视觉</span>}
                    {m.supports_streaming && <span className="text-xs bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded">流式</span>}
                  </div>
                </td>
                <td className="py-2 px-3">
                  <button onClick={() => handleDelete(m.id)} className="text-xs text-gray-500 hover:text-red-400">删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="text-gray-500 text-sm mt-4">暂无模型。</p>}
      </div>
    </div>
  );
}

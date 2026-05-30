"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { formatDateTime, labelFor } from "@/lib/ui-labels";

interface Discovery {
  id: string;
  api_key_id: string;
  provider_id: string;
  status: string;
  discovered_count: number;
  added_count: number;
  updated_count: number;
  unavailable_count: number;
  error_message: string | null;
  created_at: string;
  api_keys?: { key_alias: string };
  providers?: { name: string };
}

export default function ModelDiscoveriesPage() {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const json = await cachedJson<{ data?: Discovery[] }>("/api/model-discoveries");
    setDiscoveries(json.data || []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  if (loading) return <div className="text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">模型发现历史</h1>

      {discoveries.length === 0 ? (
        <p className="text-gray-500 text-sm">暂无发现记录。在 API 密钥页面点击「发现模型」开始。</p>
      ) : (
        <div className="space-y-3">
          {discoveries.map((d) => (
            <div key={d.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    d.status === "success" ? "bg-green-900/50 text-green-300" :
                    d.status === "partial" ? "bg-yellow-900/50 text-yellow-300" :
                    "bg-red-900/50 text-red-300"
                  }`}>{labelFor(d.status)}</span>
                  <span className="text-sm text-white font-medium">
                    {d.api_keys?.key_alias || "未知密钥"}
                  </span>
                  {d.providers?.name && (
                    <span className="text-xs text-gray-500">({d.providers.name})</span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{formatDateTime(d.created_at)}</span>
              </div>

              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">发现</p>
                  <p className="text-white font-medium">{d.discovered_count}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">新增</p>
                  <p className="text-green-400 font-medium">+{d.added_count}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">更新</p>
                  <p className="text-blue-400 font-medium">{d.updated_count}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">不可用</p>
                  <p className="text-gray-400 font-medium">{d.unavailable_count}</p>
                </div>
              </div>

              {d.error_message && (
                <p className="text-xs text-red-400 mt-2 truncate">{d.error_message}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

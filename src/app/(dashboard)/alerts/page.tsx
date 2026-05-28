"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { formatDateTime, labelFor } from "@/lib/ui-labels";

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export default function AlertsPage() {
  const [items, setItems] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (force = false) => {
    try {
      setLoadError(null);
      const json = await cachedJson<{ data?: Alert[] }>("/api/alerts", { force });
      setItems(json.data || []);
    } catch (err) {
      setLoadError("加载告警失败：" + String(err));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
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

  if (loading) return <div className="text-gray-400">加载中...</div>;
  if (loadError) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">告警</h1>
      <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{loadError}</div>
      <button onClick={() => load(true)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">重试</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">告警</h1>

      <div className="space-y-2">
        {items.map((a) => (
          <div key={a.id} className={`bg-gray-900 border rounded-lg p-4 ${a.severity === "critical" ? "border-red-800" : a.severity === "warning" ? "border-yellow-800" : "border-gray-800"}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  a.severity === "critical" ? "bg-red-900/50 text-red-300" :
                  a.severity === "warning" ? "bg-yellow-900/50 text-yellow-300" :
                  "bg-blue-900/50 text-blue-300"
                }`}>{labelFor(a.severity)}</span>
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                  a.status === "open" ? "bg-gray-800 text-gray-300" :
                  a.status === "acknowledged" ? "bg-blue-900/50 text-blue-300" :
                  a.status === "resolved" ? "bg-green-900/50 text-green-300" :
                  "bg-gray-700 text-gray-400"
                }`}>{labelFor(a.status)}</span>
                <span className="text-xs text-gray-500 ml-2">{labelFor(a.type)}</span>
              </div>
              <span className="text-xs text-gray-500">{formatDateTime(a.created_at)}</span>
            </div>
            <div className="mt-2 text-white text-sm">{a.title}</div>
            <div className="mt-1 text-xs text-gray-400">{a.message}</div>
            <div className="mt-2 flex gap-2">
              {a.status === "open" && (
                <button onClick={() => handleUpdateStatus(a.id, "acknowledged")} className="text-xs text-blue-400 hover:text-blue-300">确认</button>
              )}
              {(a.status === "open" || a.status === "acknowledged") && (
                <button onClick={() => handleUpdateStatus(a.id, "resolved")} className="text-xs text-green-400 hover:text-green-300">解决</button>
              )}
              {a.status !== "ignored" && (
                <button onClick={() => handleUpdateStatus(a.id, "ignored")} className="text-xs text-gray-500 hover:text-gray-300">忽略</button>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-gray-500 text-sm">暂无告警。</p>}
      </div>
    </div>
  );
}

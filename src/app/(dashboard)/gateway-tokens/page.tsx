"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { labelFor } from "@/lib/ui-labels";

interface GatewayToken {
  id: string;
  name: string;
  scopes: string[];
  rate_limit_per_minute: number | null;
  status: string;
  last_used_at: string | null;
  created_at: string;
}

export default function GatewayTokensPage() {
  const [items, setItems] = useState<GatewayToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", scopes: "chat:write", rate_limit_per_minute: "" });

  const load = async (force = false) => {
    const json = await cachedJson<{ data?: GatewayToken[] }>("/api/gateway-tokens", { force });
    setItems(json.data || []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/gateway-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        scopes: form.scopes.split(",").map((s) => s.trim()),
        rate_limit_per_minute: form.rate_limit_per_minute ? Number(form.rate_limit_per_minute) : null,
      }),
    });
    const json = await res.json();
    if (json.data?.token) {
      setNewToken(json.data.token);
    }
    setShowForm(false);
    setForm({ name: "", scopes: "chat:write", rate_limit_per_minute: "" });
    load(true);
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("确定撤销这个令牌？")) return;
    await fetch(`/api/gateway-tokens/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "revoked" }),
    });
    load(true);
  };

  if (loading) return <div className="text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">网关令牌</h1>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">创建令牌</button>
      </div>

      {newToken && (
        <div className="bg-gray-900 border border-green-800 rounded-lg p-4">
          <p className="text-sm text-green-300 font-medium">令牌已创建。请立即复制，它不会再次显示：</p>
          <code className="block mt-2 p-2 bg-gray-800 rounded text-xs text-green-400 font-mono break-all">{newToken}</code>
          <button onClick={() => setNewToken(null)} className="mt-2 text-xs text-gray-500 hover:text-gray-300">关闭</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">名称</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">权限范围（逗号分隔）</label><input value={form.scopes} onChange={(e) => setForm((f) => ({ ...f, scopes: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">每分钟限制</label><input type="number" value={form.rate_limit_per_minute} onChange={(e) => setForm((f) => ({ ...f, rate_limit_per_minute: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">创建</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">取消</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {items.map((t) => (
          <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="text-white font-medium">{t.name}</div>
              <div className="text-xs text-gray-500">{t.scopes.join(", ")} &middot; {t.rate_limit_per_minute ? `${t.rate_limit_per_minute}/分钟` : "不限制"}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-1.5 py-0.5 rounded ${t.status === "active" ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"}`}>{labelFor(t.status)}</span>
              {t.status === "active" && (
                <button onClick={() => handleRevoke(t.id)} className="px-3 py-1 bg-gray-800 hover:bg-red-900/50 text-gray-300 rounded text-xs">撤销</button>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-gray-500 text-sm">暂无网关令牌。</p>}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { labelFor, formatDateTime } from "@/lib/ui-labels";

interface GatewayKey {
  id: string;
  name: string;
  scopes: string[];
  rate_limit_per_minute: number | null;
  status: string;
  last_used_at: string | null;
  created_at: string;
}

const SCOPE_OPTIONS = [
  { value: "models:read", label: "读取模型" },
  { value: "chat:write", label: "聊天" },
  { value: "openai:compatible", label: "OpenAI 兼容" },
  { value: "anthropic:compatible", label: "Claude 兼容" },
];

export default function GatewayKeysPage() {
  const [items, setItems] = useState<GatewayKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", scopes: ["openai:compatible", "chat:write"] as string[], rate_limit_per_minute: "" });

  const load = async (force = false) => {
    try {
      setLoadError(null);
      const json = await cachedJson<{ data?: GatewayKey[] }>("/api/gateway-tokens", { force });
      setItems(json.data || []);
    } catch (err) {
      setLoadError("加载网关密钥失败：" + String(err));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await fetch("/api/gateway-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          scopes: form.scopes,
          rate_limit_per_minute: form.rate_limit_per_minute ? Number(form.rate_limit_per_minute) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setFormError(json.error || "创建失败"); return; }
      if (json.data?.token) setNewToken(json.data.token);
      setShowForm(false);
      setForm({ name: "", scopes: ["openai:compatible", "chat:write"], rate_limit_per_minute: "" });
      load(true);
    } catch (err) {
      setFormError("创建失败：" + String(err));
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("确定撤销该密钥？撤销后无法恢复。")) return;
    try {
      const res = await fetch(`/api/gateway-tokens/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "revoked" }) });
      if (!res.ok) { alert("撤销失败"); return; }
      load(true);
    } catch (err) {
      alert("撤销失败：" + String(err));
    }
  };

  const toggleScope = (scope: string) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter((s) => s !== scope) : [...f.scopes, scope],
    }));
  };

  if (loading) return <div className="text-gray-400">加载中...</div>;
  if (loadError) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">网关密钥</h1>
      <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{loadError}</div>
      <button onClick={() => load(true)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">重试</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">网关密钥</h1>
        <button onClick={() => { setFormError(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">创建密钥</button>
      </div>

      {newToken && (
        <div className="bg-gray-900 border border-green-800 rounded-lg p-4">
          <p className="text-sm text-green-300 font-medium">密钥已创建。请立即复制，它不会再次显示：</p>
          <code className="block mt-2 p-2 bg-gray-800 rounded text-xs text-green-400 font-mono break-all">{newToken}</code>
          <div className="mt-2 flex gap-2">
            <button onClick={() => { navigator.clipboard.writeText(newToken); }} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">复制</button>
            <button onClick={() => setNewToken(null)} className="text-xs text-gray-500 hover:text-gray-300">关闭</button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          {formError && <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">名称 *</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="如 my-app" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">每分钟限制</label><input type="number" value={form.rate_limit_per_minute} onChange={(e) => setForm((f) => ({ ...f, rate_limit_per_minute: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="不限制" /></div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">权限</label>
            <div className="flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((s) => (
                <button key={s.value} type="button" onClick={() => toggleScope(s.value)} className={`px-2 py-0.5 rounded text-xs border ${form.scopes.includes(s.value) ? "bg-blue-600 border-blue-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"}`}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">创建</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">取消</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {items.map((k) => (
          <div key={k.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium">{k.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${k.status === "active" ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"}`}>{labelFor(k.status)}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {k.scopes.map((s) => <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{s}</span>)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {k.rate_limit_per_minute ? `${k.rate_limit_per_minute}/分钟` : "不限速"}
                  {k.last_used_at && <span> &middot; 上次使用: {formatDateTime(k.last_used_at)}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {k.status === "active" && (
                  <button onClick={() => handleRevoke(k.id)} className="px-3 py-1 bg-gray-800 hover:bg-red-900/50 text-gray-300 rounded text-xs">撤销</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-gray-500 text-sm">暂无网关密钥。</p>}
      </div>
    </div>
  );
}

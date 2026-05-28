"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { labelFor } from "@/lib/ui-labels";

interface ApiKey {
  id: string;
  subscription_id: string;
  provider_id: string;
  key_alias: string;
  key_preview: string;
  base_url: string | null;
  status: string;
  monthly_budget: number | null;
  single_call_budget: number | null;
  rate_limit_per_minute: number | null;
  notes: string | null;
}

interface Subscription { id: string; plan_name: string; alias: string | null; platform: string }
interface Provider { id: string; name: string; slug: string }

export default function ApiKeysPage() {
  const [items, setItems] = useState<ApiKey[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [discovering, setDiscovering] = useState<string | null>(null);
  const [discoverResult, setDiscoverResult] = useState<Record<string, unknown> | null>(null);
  const emptyForm = { subscription_id: "", provider_id: "", key_alias: "", plaintext_key: "", base_url: "", monthly_budget: "", single_call_budget: "", rate_limit_per_minute: "", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const load = async (force = false) => {
    const [keysJson, subsJson, provJson] = await Promise.all([
      cachedJson<{ data?: ApiKey[] }>("/api/api-keys", { force }),
      cachedJson<{ data?: Subscription[] }>("/api/subscriptions", { force }),
      cachedJson<{ data?: Provider[] }>("/api/providers", { force }),
    ]);
    setItems(keysJson.data || []);
    setSubscriptions(subsJson.data || []);
    setProviders(provJson.data || []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      subscription_id: form.subscription_id || null,
      provider_id: form.provider_id,
      key_alias: form.key_alias,
      plaintext_key: form.plaintext_key,
      base_url: form.base_url || null,
      monthly_budget: form.monthly_budget ? Number(form.monthly_budget) : null,
      single_call_budget: form.single_call_budget ? Number(form.single_call_budget) : null,
      rate_limit_per_minute: form.rate_limit_per_minute ? Number(form.rate_limit_per_minute) : null,
      notes: form.notes || null,
    };
    if (editing) {
      await fetch(`/api/api-keys/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    load(true);
  };

  const handleDiscover = async (id: string) => {
    setDiscovering(id);
    setDiscoverResult(null);
    const res = await fetch(`/api/api-keys/${id}/discover`, { method: "POST" });
    const json = await res.json();
    setDiscoverResult(json.data || json.error);
    setDiscovering(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return;
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    load(true);
  };

  const handleEdit = (k: ApiKey) => {
    setEditing(k);
    setForm({
      subscription_id: k.subscription_id || "", provider_id: k.provider_id, key_alias: k.key_alias,
      plaintext_key: "", base_url: k.base_url || "", monthly_budget: k.monthly_budget?.toString() || "",
      single_call_budget: k.single_call_budget?.toString() || "", rate_limit_per_minute: k.rate_limit_per_minute?.toString() || "",
      notes: k.notes || "",
    });
    setShowForm(true);
  };

  if (loading) return <div className="text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">API 密钥</h1>
        <button onClick={() => { setForm(emptyForm); setEditing(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">添加 API 密钥</button>
      </div>

      {discoverResult && (
        <div className="bg-gray-900 border border-blue-800 rounded-lg p-4 text-sm">
          <pre className="text-gray-300 whitespace-pre-wrap">{JSON.stringify(discoverResult, null, 2)}</pre>
          <button onClick={() => setDiscoverResult(null)} className="mt-2 text-xs text-gray-500 hover:text-gray-300">关闭</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">密钥别名</label><input value={form.key_alias} onChange={(e) => setForm((f) => ({ ...f, key_alias: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">{editing ? "新密钥（留空则保持不变）" : "API 密钥"}</label><input value={form.plaintext_key} onChange={(e) => setForm((f) => ({ ...f, plaintext_key: e.target.value }))} required={!editing} type="password" className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">供应商</label><select value={form.provider_id} onChange={(e) => setForm((f) => ({ ...f, provider_id: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"><option value="">选择供应商</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">订阅</label><select value={form.subscription_id} onChange={(e) => setForm((f) => ({ ...f, subscription_id: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"><option value="">无</option>{subscriptions.map((s) => <option key={s.id} value={s.id}>{s.alias || `${s.platform} - ${s.plan_name}`}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">覆盖 Base URL</label><input value={form.base_url} onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))} placeholder="默认使用供应商配置" className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">月度预算</label><input type="number" step="0.01" value={form.monthly_budget} onChange={(e) => setForm((f) => ({ ...f, monthly_budget: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
          </div>
          <div><label className="block text-xs text-gray-400 mb-1">备注</label><textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" rows={2} /></div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">{editing ? "更新" : "创建"}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">取消</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {items.map((k) => (
          <div key={k.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="text-white font-medium">{k.key_alias}</div>
              <div className="text-xs text-gray-500 font-mono">{k.key_preview} &middot; {labelFor(k.status)}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleDiscover(k.id)} disabled={discovering === k.id} className="px-3 py-1 bg-green-900/50 hover:bg-green-800/50 text-green-300 rounded text-xs disabled:opacity-50">
                {discovering === k.id ? "发现中..." : "发现模型"}
              </button>
              <button onClick={() => handleEdit(k)} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs">编辑</button>
              <button onClick={() => handleDelete(k.id)} className="px-3 py-1 bg-gray-800 hover:bg-red-900/50 text-gray-300 rounded text-xs">删除</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-gray-500 text-sm">暂无 API 密钥。请先添加供应商。</p>}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { labelFor, formatDateTime } from "@/lib/ui-labels";

interface AccountPoolItem {
  id: string;
  name: string;
  platform_type: string;
  platform_name: string;
  base_url: string;
  auth_method: string;
  key_preview: string;
  status: string;
  last_sync_at: string | null;
  sync_error: string | null;
  notes: string | null;
  created_at: string;
}

interface DiscoveredModel {
  id: string;
  provider_model_id: string;
  display_name: string | null;
  context_length: number | null;
  enabled: boolean;
  last_seen_at: string | null;
}

const PLATFORM_TYPES = ["official", "proxy", "reseller", "shared", "api_key_only", "other"];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-900/50 text-green-300",
  needs_sync: "bg-yellow-900/50 text-yellow-300",
  syncing: "bg-blue-900/50 text-blue-300",
  sync_failed: "bg-red-900/50 text-red-300",
  invalid: "bg-red-900/50 text-red-300",
  expired: "bg-red-900/50 text-red-300",
  quota_low: "bg-yellow-900/50 text-yellow-300",
  disabled: "bg-gray-800 text-gray-400",
  needs_login: "bg-yellow-900/50 text-yellow-300",
};

export default function AccountPoolPage() {
  const [items, setItems] = useState<AccountPoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AccountPoolItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedModels, setExpandedModels] = useState<DiscoveredModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const emptyForm = { name: "", platform_type: "proxy", platform_name: "", base_url: "", plaintext_key: "", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const load = async (force = false) => {
    try {
      setLoadError(null);
      const json = await cachedJson<{ data?: AccountPoolItem[] }>("/api/account-pool", { force });
      setItems(json.data || []);
    } catch (err) {
      setLoadError("加载账号池失败：" + String(err));
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
      if (editing) {
        const body: Record<string, unknown> = {
          name: form.name,
          platform_type: form.platform_type,
          platform_name: form.platform_name,
          base_url: form.base_url,
          notes: form.notes || null,
        };
        if (form.plaintext_key) body.plaintext_key = form.plaintext_key;
        const res = await fetch(`/api/account-pool/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = await res.json();
        if (!res.ok || json.error) { setFormError(json.error || "更新失败"); return; }
      } else {
        const res = await fetch("/api/account-pool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const json = await res.json();
        if (!res.ok || json.error) { setFormError(json.error || "创建失败"); return; }
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      load(true);
    } catch (err) {
      setFormError("请求失败：" + String(err));
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/account-pool/${id}/sync`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) {
        setSyncResult("同步失败：" + (json.error || "未知错误"));
      } else {
        const r = json.data;
        const parts = [`发现 ${r.models_discovered} 个模型`];
        if (r.models_added > 0) parts.push(`新增 ${r.models_added} 个`);
        if (r.models_updated > 0) parts.push(`更新 ${r.models_updated} 个`);
        if (r.endpoints_added > 0) parts.push(`创建 ${r.endpoints_added} 个端点`);
        if (r.endpoint_errors?.length > 0) parts.push(`端点错误 ${r.endpoint_errors.length} 个`);
        setSyncResult("同步完成：" + parts.join("，"));
      }
      load(true);
    } catch (err) {
      setSyncResult("同步失败：" + String(err));
    } finally {
      setSyncingId(null);
    }
  };

  const handleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setLoadingModels(true);
    try {
      await fetch(`/api/account-pool/${id}`);
      setExpandedModels([]);
    } catch {
      setExpandedModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该账号？关联的供应商和 API 密钥不会被删除。")) return;
    try {
      const res = await fetch(`/api/account-pool/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || json.error) { alert("删除失败：" + (json.error || "未知错误")); return; }
      load(true);
    } catch (err) {
      alert("删除失败：" + String(err));
    }
  };

  const handleEdit = (item: AccountPoolItem) => {
    setEditing(item);
    setFormError(null);
    setForm({ name: item.name, platform_type: item.platform_type, platform_name: item.platform_name, base_url: item.base_url, plaintext_key: "", notes: item.notes || "" });
    setShowForm(true);
  };

  if (loading) return <div className="text-gray-400">加载中...</div>;
  if (loadError) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">账号池</h1>
      <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{loadError}</div>
      <button onClick={() => load(true)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">重试</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">账号池</h1>
        <button onClick={() => { setForm(emptyForm); setEditing(null); setFormError(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">添加账号</button>
      </div>

      {syncResult && (
        <div className={`border rounded p-3 text-sm ${syncResult.startsWith("同步完成") ? "bg-green-900/30 border-green-800 text-green-300" : "bg-red-900/30 border-red-800 text-red-300"}`}>
          {syncResult}
          <button onClick={() => setSyncResult(null)} className="ml-2 text-xs opacity-70 hover:opacity-100">关闭</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          {formError && <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">名称 *</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="如 mimo 中转站" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">平台类型</label><select value={form.platform_type} onChange={(e) => setForm((f) => ({ ...f, platform_type: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{PLATFORM_TYPES.map((t) => <option key={t} value={t}>{labelFor(t)}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">平台名称 *</label><input value={form.platform_name} onChange={(e) => setForm((f) => ({ ...f, platform_name: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="如 OpenAI / mimo / Cursor" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">接入地址 *</label><input value={form.base_url} onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="https://api.openai.com" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">{editing ? "API 密钥（留空则保持不变）" : "API 密钥 *"}</label><input type="password" value={form.plaintext_key} onChange={(e) => setForm((f) => ({ ...f, plaintext_key: e.target.value }))} required={!editing} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="sk-..." /></div>
            <div><label className="block text-xs text-gray-400 mb-1">备注</label><input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="可选" /></div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">{editing ? "更新" : "创建"}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">取消</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium">{item.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{labelFor(item.platform_type)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[item.status] || "bg-gray-800 text-gray-400"}`}>{labelFor(item.status)}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>{item.platform_name}</span>
                  <span>&middot;</span>
                  <span className="font-mono">{item.key_preview}</span>
                  <span>&middot;</span>
                  <span>{item.base_url}</span>
                </div>
                {item.last_sync_at && <div className="text-xs text-gray-500 mt-0.5">上次同步: {formatDateTime(item.last_sync_at)}</div>}
                {item.sync_error && <div className="text-xs text-red-400 mt-0.5">{item.sync_error}</div>}
                {item.notes && <div className="text-xs text-gray-500 mt-0.5">{item.notes}</div>}
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <button onClick={() => handleSync(item.id)} disabled={syncingId === item.id} className="px-3 py-1 bg-green-900/50 hover:bg-green-800/50 text-green-300 rounded text-xs disabled:opacity-50">
                  {syncingId === item.id ? "同步中..." : "同步"}
                </button>
                <button onClick={() => handleExpand(item.id)} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs">
                  {expandedId === item.id ? "收起" : "详情"}
                </button>
                <button onClick={() => handleEdit(item)} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs">编辑</button>
                <button onClick={() => handleDelete(item.id)} className="px-3 py-1 bg-gray-800 hover:bg-red-900/50 text-gray-300 rounded text-xs">删除</button>
              </div>
            </div>
            {expandedId === item.id && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                {loadingModels ? (
                  <div className="text-gray-500 text-xs">加载中...</div>
                ) : expandedModels.length > 0 ? (
                  <div>
                    <div className="text-xs text-gray-400 mb-2">已发现 {expandedModels.length} 个模型</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-gray-800">
                          <th className="text-left py-1 px-2 text-gray-400">模型 ID</th>
                          <th className="text-left py-1 px-2 text-gray-400">显示名</th>
                          <th className="text-left py-1 px-2 text-gray-400">上下文</th>
                          <th className="text-left py-1 px-2 text-gray-400">状态</th>
                        </tr></thead>
                        <tbody>
                          {expandedModels.map((m) => (
                            <tr key={m.id} className="border-b border-gray-800/50">
                              <td className="py-1 px-2 text-gray-300 font-mono">{m.provider_model_id}</td>
                              <td className="py-1 px-2 text-gray-400">{m.display_name || "—"}</td>
                              <td className="py-1 px-2 text-gray-400">{m.context_length?.toLocaleString() || "—"}</td>
                              <td className="py-1 px-2"><span className={`px-1 rounded ${m.enabled ? "text-green-400" : "text-gray-500"}`}>{m.enabled ? "启用" : "禁用"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">点击&ldquo;同步&rdquo;后可在此查看已发现的模型。</div>
                )}
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-gray-500 text-sm">暂无账号。点击&ldquo;添加账号&rdquo;开始。</p>}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";

interface Provider {
  id: string;
  name: string;
  slug: string;
  provider_type: string;
  base_url: string;
  models_endpoint: string;
  chat_endpoint: string;
  auth_type: string;
  status: string;
  notes: string | null;
}

const PROVIDER_TYPES = ["openai_compatible", "anthropic", "gemini", "openrouter", "custom"];
const DEFAULT_ENDPOINTS: Record<string, { models: string; chat: string; auth: string }> = {
  openai_compatible: { models: "/v1/models", chat: "/v1/chat/completions", auth: "bearer" },
  anthropic: { models: "/v1/models", chat: "/v1/messages", auth: "x-api-key" },
  gemini: { models: "/v1beta/models", chat: "/v1beta/models", auth: "query" },
  openrouter: { models: "/v1/models", chat: "/v1/chat/completions", auth: "bearer" },
  custom: { models: "/v1/models", chat: "/v1/chat/completions", auth: "bearer" },
};

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", provider_type: "openai_compatible", base_url: "", models_endpoint: "/v1/models", chat_endpoint: "/v1/chat/completions", auth_type: "bearer", status: "active", notes: "" });

  const load = async (force = false) => {
    const json = await cachedJson<{ data?: Provider[] }>("/api/providers", { force });
    setProviders(json.data || []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const handleTypeChange = (type: string) => {
    const defaults = DEFAULT_ENDPOINTS[type] || DEFAULT_ENDPOINTS.openai_compatible;
    setForm((f) => ({ ...f, provider_type: type, models_endpoint: defaults.models, chat_endpoint: defaults.chat, auth_type: defaults.auth }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await fetch(`/api/providers/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    } else {
      await fetch("/api/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    }
    setShowForm(false);
    setEditing(null);
    resetForm();
    load(true);
  };

  const handleEdit = (p: Provider) => {
    setEditing(p);
    setForm({ name: p.name, slug: p.slug, provider_type: p.provider_type, base_url: p.base_url, models_endpoint: p.models_endpoint, chat_endpoint: p.chat_endpoint, auth_type: p.auth_type, status: p.status, notes: p.notes || "" });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这个供应商？")) return;
    await fetch(`/api/providers/${id}`, { method: "DELETE" });
    load(true);
  };

  const resetForm = () => setForm({ name: "", slug: "", provider_type: "openai_compatible", base_url: "", models_endpoint: "/v1/models", chat_endpoint: "/v1/chat/completions", auth_type: "bearer", status: "active", notes: "" });

  if (loading) return <div className="text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">供应商</h1>
        <button onClick={() => { resetForm(); setEditing(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">添加供应商</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">名称</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">标识</label><input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">类型</label><select value={form.provider_type} onChange={(e) => handleTypeChange(e.target.value)} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{PROVIDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">基础 URL</label><input value={form.base_url} onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))} required placeholder="https://api.openai.com" className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">模型列表端点</label><input value={form.models_endpoint} onChange={(e) => setForm((f) => ({ ...f, models_endpoint: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">聊天端点</label><input value={form.chat_endpoint} onChange={(e) => setForm((f) => ({ ...f, chat_endpoint: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
          </div>
          <div><label className="block text-xs text-gray-400 mb-1">备注</label><textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" rows={2} /></div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">{editing ? "更新" : "创建"}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">取消</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {providers.map((p) => (
          <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="text-white font-medium">{p.name}</div>
              <div className="text-xs text-gray-500">{p.provider_type} &middot; {p.base_url}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(p)} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs">编辑</button>
              <button onClick={() => handleDelete(p.id)} className="px-3 py-1 bg-gray-800 hover:bg-red-900/50 text-gray-300 rounded text-xs">删除</button>
            </div>
          </div>
        ))}
        {providers.length === 0 && <p className="text-gray-500 text-sm">暂无供应商。</p>}
      </div>
    </div>
  );
}

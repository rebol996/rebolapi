"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { labelFor } from "@/lib/ui-labels";

interface Budget {
  id: string;
  scope: string;
  scope_id: string | null;
  period: string;
  amount: number;
  currency: string;
  warning_threshold: number | null;
  hard_limit: boolean;
  status: string;
}

const SCOPES = ["global", "provider", "subscription", "api_key", "model", "model_endpoint", "task_type"];
const PERIODS = ["daily", "weekly", "monthly", "yearly"];

export default function BudgetsPage() {
  const [items, setItems] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ scope: "global", scope_id: "", period: "monthly", amount: "", currency: "USD", warning_threshold: "80", hard_limit: true });

  const load = async (force = false) => {
    try {
      setLoadError(null);
      const json = await cachedJson<{ data?: Budget[] }>("/api/budgets", { force });
      setItems(json.data || []);
    } catch (err) {
      setLoadError("加载预算失败：" + String(err));
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
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: form.scope,
          scope_id: form.scope_id || null,
          period: form.period,
          amount: Number(form.amount),
          currency: form.currency,
          warning_threshold: form.warning_threshold ? Number(form.warning_threshold) : null,
          hard_limit: form.hard_limit,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setFormError(json.error || "创建预算失败");
        return;
      }
      setShowForm(false);
      setForm({ scope: "global", scope_id: "", period: "monthly", amount: "", currency: "USD", warning_threshold: "80", hard_limit: true });
      load(true);
    } catch (err) {
      setFormError("创建预算失败：" + String(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return;
    try {
      const res = await fetch(`/api/budgets/${id}`, { method: "DELETE" });
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
      <h1 className="text-2xl font-bold text-white">预算</h1>
      <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{loadError}</div>
      <button onClick={() => load(true)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">重试</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">预算</h1>
        <button onClick={() => { setFormError(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">添加预算</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          {formError && <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">范围</label><select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{SCOPES.map((s) => <option key={s} value={s}>{labelFor(s)}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">金额</label><input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">周期</label><select value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{PERIODS.map((p) => <option key={p} value={p}>{labelFor(p)}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">警告阈值 %</label><input type="number" value={form.warning_threshold} onChange={(e) => setForm((f) => ({ ...f, warning_threshold: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.hard_limit} onChange={(e) => setForm((f) => ({ ...f, hard_limit: e.target.checked }))} /> 硬限制</label></div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">创建</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">取消</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {items.map((b) => (
          <div key={b.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-white font-medium">{labelFor(b.scope)}</span>
                <span className="ml-2 text-gray-400 text-sm">${b.amount} {b.currency} / {labelFor(b.period)}</span>
                {b.warning_threshold && <span className="ml-2 text-xs text-yellow-500">警告阈值 {b.warning_threshold}%</span>}
                {b.hard_limit && <span className="ml-2 text-xs bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded">硬限制</span>}
              </div>
              <button onClick={() => handleDelete(b.id)} className="px-3 py-1 bg-gray-800 hover:bg-red-900/50 text-gray-300 rounded text-xs shrink-0">删除</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-gray-500 text-sm">暂无预算配置。</p>}
      </div>
    </div>
  );
}

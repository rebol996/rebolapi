"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { labelFor } from "@/lib/ui-labels";

interface Subscription {
  id: string;
  platform: string;
  plan_name: string;
  alias: string | null;
  account_label: string | null;
  price: number | null;
  currency: string;
  billing_cycle: string;
  renewal_date: string | null;
  auto_renew: boolean;
  status: string;
  quota_type: string;
  quota_total: number | null;
  quota_used: number | null;
  notes: string | null;
}

const STATUSES = ["active", "paused", "canceled", "expired", "trial", "unknown"];
const BILLING_CYCLES = ["monthly", "yearly", "one_time", "usage_based", "unknown"];
const QUOTA_TYPES = ["token", "request", "credit", "message", "hour", "daily_limit", "monthly_limit", "unlimited", "unknown"];
const CURRENCIES = ["USD", "CNY", "EUR", "GBP", "JPY", "KRW"];

export default function SubscriptionsPage() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const emptyForm = { platform: "", plan_name: "", alias: "", account_label: "", price: "", currency: "USD", billing_cycle: "monthly", renewal_date: "", auto_renew: true, status: "active", quota_type: "unknown", quota_total: "", quota_used: "", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const load = async (force = false) => {
    const json = await cachedJson<{ data?: Subscription[] }>("/api/subscriptions", { force });
    setItems(json.data || []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      platform: form.platform,
      plan_name: form.plan_name,
      alias: form.alias || null,
      account_label: form.account_label || null,
      price: form.price ? Number(form.price) : null,
      currency: form.currency,
      billing_cycle: form.billing_cycle,
      renewal_date: form.renewal_date || null,
      auto_renew: form.auto_renew,
      status: form.status,
      quota_type: form.quota_type,
      quota_total: form.quota_total ? Number(form.quota_total) : null,
      quota_used: form.quota_used ? Number(form.quota_used) : null,
      notes: form.notes || null,
    };
    if (editing) {
      await fetch(`/api/subscriptions/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    load(true);
  };

  const handleEdit = (s: Subscription) => {
    setEditing(s);
    setForm({
      platform: s.platform, plan_name: s.plan_name, alias: s.alias || "", account_label: s.account_label || "",
      price: s.price?.toString() || "", currency: s.currency, billing_cycle: s.billing_cycle,
      renewal_date: s.renewal_date || "", auto_renew: s.auto_renew, status: s.status,
      quota_type: s.quota_type, quota_total: s.quota_total?.toString() || "", quota_used: s.quota_used?.toString() || "",
      notes: s.notes || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该订阅？此操作不可撤销。")) return;
    await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
    load(true);
  };

  if (loading) return <div className="text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">订阅</h1>
        <button onClick={() => { setForm(emptyForm); setEditing(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">添加订阅</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">平台名称 *</label><input value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="如 OpenAI" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">套餐名称 *</label><input value={form.plan_name} onChange={(e) => setForm((f) => ({ ...f, plan_name: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="如 Pro" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">别名</label><input value={form.alias} onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="自定义显示名" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">账户标签</label><input value={form.account_label} onChange={(e) => setForm((f) => ({ ...f, account_label: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="如 work / personal" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">价格</label><input type="number" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="0.00" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">币种</label><select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">计费周期</label><select value={form.billing_cycle} onChange={(e) => setForm((f) => ({ ...f, billing_cycle: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{BILLING_CYCLES.map((c) => <option key={c} value={c}>{labelFor(c)}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">续费日期</label><input type="date" value={form.renewal_date} onChange={(e) => setForm((f) => ({ ...f, renewal_date: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-300 pb-1.5">
                <input type="checkbox" checked={form.auto_renew} onChange={(e) => setForm((f) => ({ ...f, auto_renew: e.target.checked }))} className="rounded border-gray-600 bg-gray-800" />
                自动续费
              </label>
            </div>
            <div><label className="block text-xs text-gray-400 mb-1">状态</label><select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{STATUSES.map((s) => <option key={s} value={s}>{labelFor(s)}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">额度类型</label><select value={form.quota_type} onChange={(e) => setForm((f) => ({ ...f, quota_type: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{QUOTA_TYPES.map((q) => <option key={q} value={q}>{labelFor(q)}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">总额度</label><input type="number" value={form.quota_total} onChange={(e) => setForm((f) => ({ ...f, quota_total: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="0" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">已用额度</label><input type="number" value={form.quota_used} onChange={(e) => setForm((f) => ({ ...f, quota_used: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="0" /></div>
          </div>
          <div><label className="block text-xs text-gray-400 mb-1">备注</label><textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" rows={2} placeholder="可选备注信息" /></div>
          <div className="flex gap-2 flex-wrap">
            <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">{editing ? "更新" : "创建"}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">取消</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {items.map((s) => {
          const quotaPercent = s.quota_total && s.quota_used != null ? Math.round((s.quota_used / s.quota_total) * 100) : null;
          return (
            <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{s.alias || `${s.platform} - ${s.plan_name}`}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${s.status === "active" ? "bg-green-900/50 text-green-300" : "bg-gray-800 text-gray-400"}`}>{labelFor(s.status)}</span>
                    {s.auto_renew && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300">自动续费</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>{s.platform}</span>
                    <span>&middot;</span>
                    <span>{s.plan_name}</span>
                    <span>&middot;</span>
                    <span>{labelFor(s.billing_cycle)}</span>
                    {s.price != null && <><span>&middot;</span><span>{s.currency} {s.price}</span></>}
                    {s.renewal_date && <><span>&middot;</span><span>续费 {s.renewal_date}</span></>}
                  </div>
                  {quotaPercent != null && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 max-w-xs h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${quotaPercent > 90 ? "bg-red-500" : quotaPercent > 70 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(quotaPercent, 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{s.quota_used}/{s.quota_total} ({quotaPercent}%)</span>
                    </div>
                  )}
                  {s.notes && <p className="text-xs text-gray-500 mt-1 truncate">{s.notes}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleEdit(s)} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs">编辑</button>
                  <button onClick={() => handleDelete(s.id)} className="px-3 py-1 bg-gray-800 hover:bg-red-900/50 text-gray-300 rounded text-xs">删除</button>
                </div>
              </div>
            </div>
          );
        })}
        {items.length === 0 && <p className="text-gray-500 text-sm">暂无订阅。</p>}
      </div>
    </div>
  );
}

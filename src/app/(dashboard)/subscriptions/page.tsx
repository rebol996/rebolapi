"use client";

import { useState, useEffect, useMemo } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { labelFor, formatDate, daysUntil } from "@/lib/ui-labels";

interface Subscription {
  id: string;
  platform: string;
  plan_name: string;
  alias: string | null;
  account_label: string | null;
  source_type: string;
  vendor_url: string | null;
  console_url: string | null;
  price: number | null;
  currency: string;
  billing_cycle: string;
  purchase_date: string | null;
  renewal_date: string | null;
  expires_at: string | null;
  auto_renew: boolean;
  status: string;
  quota_type: string;
  quota_total: number | null;
  quota_used: number | null;
  tags: string[] | null;
  notes: string | null;
}

const STATUSES = ["active", "paused", "canceled", "expired", "trial", "unknown"];
const BILLING_CYCLES = ["monthly", "yearly", "one_time", "usage_based", "unknown"];
const QUOTA_TYPES = ["token", "request", "credit", "message", "hour", "daily_limit", "monthly_limit", "unlimited", "unknown"];
const CURRENCIES = ["USD", "CNY", "EUR", "GBP", "JPY", "KRW"];
const SOURCE_TYPES = ["official", "reseller", "proxy", "shared_account", "one_time", "other"];
const TAG_PRESETS = ["coding", "chat", "image", "backup", "cheap", "primary", "secondary", "team"];

const emptyForm = {
  platform: "", plan_name: "", alias: "", account_label: "",
  source_type: "official", vendor_url: "", console_url: "",
  price: "", currency: "USD", billing_cycle: "monthly",
  purchase_date: "", renewal_date: "", expires_at: "",
  auto_renew: true, status: "active",
  quota_type: "unknown", quota_total: "", quota_used: "",
  tags: [] as string[], notes: "",
};

export default function SubscriptionsPage() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterRenewSoon, setFilterRenewSoon] = useState(false);

  const load = async (force = false) => {
    try {
      setLoadError(null);
      const json = await cachedJson<{ data?: Subscription[] }>("/api/subscriptions", { force });
      setItems(json.data || []);
    } catch (err) {
      setLoadError("加载订阅失败：" + String(err));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return items.filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        const haystack = [s.platform, s.plan_name, s.alias, s.account_label, s.vendor_url, s.notes, ...(s.tags || [])].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filterStatus && s.status !== filterStatus) return false;
      if (filterSource && s.source_type !== filterSource) return false;
      if (filterRenewSoon) {
        const days = daysUntil(s.renewal_date || s.expires_at);
        if (days == null || days > 30 || days < 0) return false;
      }
      return true;
    });
  }, [items, search, filterStatus, filterSource, filterRenewSoon]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const body: Record<string, unknown> = {
      platform: form.platform,
      plan_name: form.plan_name,
      alias: form.alias || null,
      account_label: form.account_label || null,
      source_type: form.source_type,
      vendor_url: form.vendor_url || null,
      console_url: form.console_url || null,
      price: form.price ? Number(form.price) : null,
      currency: form.currency,
      billing_cycle: form.billing_cycle,
      purchase_date: form.purchase_date || null,
      renewal_date: form.renewal_date || null,
      expires_at: form.expires_at || null,
      auto_renew: form.auto_renew,
      status: form.status,
      quota_type: form.quota_type,
      quota_total: form.quota_total ? Number(form.quota_total) : null,
      quota_used: form.quota_used ? Number(form.quota_used) : null,
      tags: form.tags.length > 0 ? form.tags : [],
      notes: form.notes || null,
    };
    try {
      const url = editing ? `/api/subscriptions/${editing.id}` : "/api/subscriptions";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || json.error) {
        const msg = json.error || "未知错误";
        setFormError(msg.includes("permission denied") ? `当前账号没有数据表的访问权限，请检查 Supabase 表授权。(${msg})` : msg);
        return;
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      load(true);
    } catch (err) {
      setFormError("请求失败：" + String(err));
    }
  };

  const handleEdit = (s: Subscription) => {
    setEditing(s);
    setFormError(null);
    setForm({
      platform: s.platform, plan_name: s.plan_name, alias: s.alias || "", account_label: s.account_label || "",
      source_type: s.source_type || "official", vendor_url: s.vendor_url || "", console_url: s.console_url || "",
      price: s.price?.toString() || "", currency: s.currency, billing_cycle: s.billing_cycle,
      purchase_date: s.purchase_date || "", renewal_date: s.renewal_date || "", expires_at: s.expires_at || "",
      auto_renew: s.auto_renew, status: s.status,
      quota_type: s.quota_type, quota_total: s.quota_total?.toString() || "", quota_used: s.quota_used?.toString() || "",
      tags: s.tags || [], notes: s.notes || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该订阅？此操作不可撤销。")) return;
    try {
      const res = await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
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

  const toggleTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));
  };

  if (loading) return <div className="text-gray-400">加载中...</div>;
  if (loadError) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">订阅</h1>
      <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{loadError}</div>
      <button onClick={() => { setLoading(true); load(true); }} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">重试</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">订阅</h1>
        <button onClick={() => { setForm(emptyForm); setEditing(null); setFormError(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">添加订阅</button>
      </div>

      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex flex-col sm:flex-row gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索平台、套餐、别名、标签..." className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm min-w-0" />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          <option value="">全部状态</option>
          {STATUSES.map((s) => <option key={s} value={s}>{labelFor(s)}</option>)}
        </select>
        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          <option value="">全部来源</option>
          {SOURCE_TYPES.map((s) => <option key={s} value={s}>{labelFor(s)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-400 whitespace-nowrap">
          <input type="checkbox" checked={filterRenewSoon} onChange={(e) => setFilterRenewSoon(e.target.checked)} className="rounded border-gray-600 bg-gray-800" />
          即将续费
        </label>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          {formError && <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{formError}</div>}

          {/* Row 1: Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">来源类型</label><select value={form.source_type} onChange={(e) => setForm((f) => ({ ...f, source_type: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{SOURCE_TYPES.map((s) => <option key={s} value={s}>{labelFor(s)}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">平台/商家名称 *</label><input value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="如 OpenAI / mimo" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">套餐名称 *</label><input value={form.plan_name} onChange={(e) => setForm((f) => ({ ...f, plan_name: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="如 Plus / Pro" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">显示别名</label><input value={form.alias} onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="自定义显示名" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">登录账号/标签</label><input value={form.account_label} onChange={(e) => setForm((f) => ({ ...f, account_label: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="如 work / personal" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">状态</label><select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{STATUSES.map((s) => <option key={s} value={s}>{labelFor(s)}</option>)}</select></div>
          </div>

          {/* Row 2: URLs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">购买渠道/中转站 URL</label><input value={form.vendor_url} onChange={(e) => setForm((f) => ({ ...f, vendor_url: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="如 https://mimo.example.com" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">官网/控制台 URL</label><input value={form.console_url} onChange={(e) => setForm((f) => ({ ...f, console_url: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="如 https://platform.openai.com" /></div>
          </div>

          {/* Row 3: Price & billing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">价格</label><input type="number" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="0.00" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">币种</label><select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">计费周期</label><select value={form.billing_cycle} onChange={(e) => setForm((f) => ({ ...f, billing_cycle: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{BILLING_CYCLES.map((c) => <option key={c} value={c}>{labelFor(c)}</option>)}</select></div>
            <div className="flex items-end gap-3"><label className="flex items-center gap-2 text-sm text-gray-300 pb-1.5"><input type="checkbox" checked={form.auto_renew} onChange={(e) => setForm((f) => ({ ...f, auto_renew: e.target.checked }))} className="rounded border-gray-600 bg-gray-800" /> 自动续费</label></div>
          </div>

          {/* Row 4: Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">购买日期</label><input type="date" value={form.purchase_date} onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">续费日期</label><input type="date" value={form.renewal_date} onChange={(e) => setForm((f) => ({ ...f, renewal_date: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">到期日期</label><input type="date" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
          </div>

          {/* Row 5: Quota */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">额度类型</label><select value={form.quota_type} onChange={(e) => setForm((f) => ({ ...f, quota_type: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{QUOTA_TYPES.map((q) => <option key={q} value={q}>{labelFor(q)}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">总额度</label><input type="number" value={form.quota_total} onChange={(e) => setForm((f) => ({ ...f, quota_total: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="0" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">已用额度</label><input type="number" value={form.quota_used} onChange={(e) => setForm((f) => ({ ...f, quota_used: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" placeholder="0" /></div>
          </div>

          {/* Row 6: Tags */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">标签</label>
            <div className="flex flex-wrap gap-2">
              {TAG_PRESETS.map((tag) => (
                <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`px-2 py-0.5 rounded text-xs border ${form.tags.includes(tag) ? "bg-blue-600 border-blue-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"}`}>{tag}</button>
              ))}
            </div>
          </div>

          {/* Row 7: Notes */}
          <div><label className="block text-xs text-gray-400 mb-1">备注</label><textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" rows={2} placeholder="可选备注信息" /></div>

          <div className="flex gap-2 flex-wrap">
            <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">{editing ? "更新" : "创建"}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">取消</button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="space-y-2">
        {filtered.map((s) => {
          const quotaPercent = s.quota_total && s.quota_used != null ? Math.round((s.quota_used / s.quota_total) * 100) : null;
          const renewDays = daysUntil(s.renewal_date || s.expires_at);
          const isExpiringSoon = renewDays != null && renewDays >= 0 && renewDays <= 30;
          const isExpired = renewDays != null && renewDays < 0;
          const isLowQuota = quotaPercent != null && quotaPercent > 80;

          return (
            <div key={s.id} className={`bg-gray-900 border rounded-lg p-4 ${isExpired ? "border-red-800" : isExpiringSoon ? "border-yellow-800" : isLowQuota ? "border-yellow-800/50" : "border-gray-800"}`}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{s.alias || `${s.platform} - ${s.plan_name}`}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${s.status === "active" ? "bg-green-900/50 text-green-300" : "bg-gray-800 text-gray-400"}`}>{labelFor(s.status)}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{labelFor(s.source_type)}</span>
                    {s.auto_renew && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300">自动续费</span>}
                    {isExpiringSoon && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-300">{renewDays === 0 ? "今天到期" : `${renewDays}天后到期`}</span>}
                    {isExpired && <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-300">已过期</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>{s.platform}</span>
                    <span>&middot;</span>
                    <span>{s.plan_name}</span>
                    <span>&middot;</span>
                    <span>{labelFor(s.billing_cycle)}</span>
                    {s.price != null && <><span>&middot;</span><span>{s.currency} {s.price}</span></>}
                    {s.renewal_date && <><span>&middot;</span><span>续费 {formatDate(s.renewal_date)}</span></>}
                    {s.expires_at && <><span>&middot;</span><span>到期 {formatDate(s.expires_at)}</span></>}
                  </div>
                  {s.vendor_url && <div className="text-xs text-gray-500 mt-0.5">渠道: <a href={s.vendor_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{s.vendor_url}</a></div>}
                  {quotaPercent != null && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 max-w-xs h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isLowQuota ? "bg-red-500" : quotaPercent > 60 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(quotaPercent, 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{s.quota_used}/{s.quota_total} ({quotaPercent}%)</span>
                    </div>
                  )}
                  {s.tags && s.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.tags.map((tag) => <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{tag}</span>)}
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
        {filtered.length === 0 && items.length > 0 && <p className="text-gray-500 text-sm">没有匹配的订阅。</p>}
        {items.length === 0 && <p className="text-gray-500 text-sm">暂无订阅。</p>}
      </div>
    </div>
  );
}

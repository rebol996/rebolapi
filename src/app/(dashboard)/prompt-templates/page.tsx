"use client";

import { useState, useEffect } from "react";
import { cachedJson } from "@/lib/client/api-cache";
import { labelFor } from "@/lib/ui-labels";

interface PromptTemplate {
  id: string;
  name: string;
  task_type: string;
  system_prompt: string | null;
  user_prompt_template: string;
  default_strategy: string;
  default_temperature: number | null;
  status: string;
  notes: string | null;
}

const TASK_TYPES = ["chat", "analyze", "review", "plan", "refactor", "bug_diagnosis", "test_generation", "security_review", "performance_analysis", "pr_description", "commit_message", "requirement_breakdown", "architecture_planning", "custom"];
const STRATEGIES = ["manual", "best_quality", "lowest_cost", "fastest", "most_quota_left", "balanced", "fallback_chain"];

export default function PromptTemplatesPage() {
  const [items, setItems] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const emptyForm = { name: "", task_type: "custom", system_prompt: "", user_prompt_template: "", default_strategy: "balanced", default_temperature: "0.7", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const load = async (force = false) => {
    const json = await cachedJson<{ data?: PromptTemplate[] }>("/api/prompt-templates", { force });
    setItems(json.data || []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      name: form.name,
      task_type: form.task_type,
      system_prompt: form.system_prompt || null,
      user_prompt_template: form.user_prompt_template,
      default_strategy: form.default_strategy,
      default_temperature: form.default_temperature ? Number(form.default_temperature) : null,
      notes: form.notes || null,
    };
    if (editing) {
      await fetch(`/api/prompt-templates/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/prompt-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    load(true);
  };

  const handleEdit = (t: PromptTemplate) => {
    setEditing(t);
    setForm({
      name: t.name, task_type: t.task_type, system_prompt: t.system_prompt || "",
      user_prompt_template: t.user_prompt_template, default_strategy: t.default_strategy,
      default_temperature: t.default_temperature?.toString() || "", notes: t.notes || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return;
    await fetch(`/api/prompt-templates/${id}`, { method: "DELETE" });
    load(true);
  };

  if (loading) return <div className="text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">提示词模板</h1>
        <button onClick={() => { setForm(emptyForm); setEditing(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">添加模板</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-400 mb-1">名称</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" /></div>
            <div><label className="block text-xs text-gray-400 mb-1">任务类型</label><select value={form.task_type} onChange={(e) => setForm((f) => ({ ...f, task_type: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{TASK_TYPES.map((t) => <option key={t} value={t}>{labelFor(t)}</option>)}</select></div>
            <div><label className="block text-xs text-gray-400 mb-1">策略</label><select value={form.default_strategy} onChange={(e) => setForm((f) => ({ ...f, default_strategy: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">{STRATEGIES.map((s) => <option key={s} value={s}>{labelFor(s)}</option>)}</select></div>
          </div>
          <div><label className="block text-xs text-gray-400 mb-1">系统提示词</label><textarea value={form.system_prompt} onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm font-mono" rows={3} /></div>
          <div><label className="block text-xs text-gray-400 mb-1">用户提示词模板</label><textarea value={form.user_prompt_template} onChange={(e) => setForm((f) => ({ ...f, user_prompt_template: e.target.value }))} required className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm font-mono" rows={4} placeholder="使用 {{variable}} 作为变量占位符" /></div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">{editing ? "更新" : "创建"}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">取消</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {items.map((t) => (
          <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-white font-medium">{t.name}</span>
                <span className="ml-2 text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{labelFor(t.task_type)}</span>
                <span className="ml-2 text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{labelFor(t.default_strategy)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleEdit(t)} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs">编辑</button>
                <button onClick={() => handleDelete(t.id)} className="px-3 py-1 bg-gray-800 hover:bg-red-900/50 text-gray-300 rounded text-xs">删除</button>
              </div>
            </div>
            <pre className="mt-2 text-xs text-gray-500 font-mono whitespace-pre-wrap max-h-20 overflow-hidden">{t.user_prompt_template}</pre>
          </div>
        ))}
        {items.length === 0 && <p className="text-gray-500 text-sm">暂无模板。</p>}
      </div>
    </div>
  );
}

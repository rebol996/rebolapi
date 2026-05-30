"use client";

import { useState } from "react";

const IMPORT_TYPES = [
  { value: "full", label: "完整备份" },
  { value: "subscriptions", label: "订阅" },
  { value: "prompt_templates", label: "提示模板" },
  { value: "provider_config", label: "供应商配置" },
] as const;

interface ImportResult {
  imported: number;
  errors: number;
  skipped: number;
}

export default function ImportPage() {
  const [type, setType] = useState<string>("full");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, ImportResult> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      let data: unknown;

      try {
        data = JSON.parse(text);
      } catch {
        setError("文件格式错误：无法解析 JSON");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/data/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, data }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "请求失败" }));
        setError(body.error || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }

      const json = await res.json();
      setResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setLoading(false);
    }
  };

  const totalImported = result
    ? Object.values(result).reduce((s, r) => s + r.imported, 0)
    : 0;
  const totalErrors = result
    ? Object.values(result).reduce((s, r) => s + r.errors, 0)
    : 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">数据导入</h1>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">导入类型</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
          >
            {IMPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">选择文件（JSON）</label>
          <input
            type="file"
            accept=".json"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700"
          />
          {file && (
            <p className="text-xs text-gray-500 mt-1">
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        <button
          onClick={handleImport}
          disabled={!file || loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-sm font-medium transition-colors"
        >
          {loading ? "导入中..." : "开始导入"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-900/50 border border-red-800 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-green-400 font-medium">{totalImported} 条已导入</span>
            {totalErrors > 0 && (
              <span className="text-red-400">{totalErrors} 条失败</span>
            )}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-1.5 text-gray-400 font-medium">表</th>
                <th className="text-right py-1.5 text-gray-400 font-medium">导入</th>
                <th className="text-right py-1.5 text-gray-400 font-medium">失败</th>
                <th className="text-right py-1.5 text-gray-400 font-medium">跳过</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result).map(([table, stats]) => (
                <tr key={table} className="border-b border-gray-800/50">
                  <td className="py-1.5 text-white">{table}</td>
                  <td className="py-1.5 text-right text-green-400">{stats.imported}</td>
                  <td className="py-1.5 text-right text-red-400">{stats.errors}</td>
                  <td className="py-1.5 text-right text-gray-400">{stats.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-500 space-y-1">
        <p>支持从 Rebol API 导出的 JSON 备份文件导入。</p>
        <p>安全敏感字段（API 密钥、token 哈希）在导入时会被自动跳过。</p>
        <p>单次导入上限 5 MB。</p>
      </div>
    </div>
  );
}

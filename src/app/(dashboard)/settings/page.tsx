"use client";

import { useState, useEffect, useRef } from "react";
import { NotificationSettings } from "@/components/notification-settings";

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [exportType, setExportType] = useState("full");
  const [exportFormat, setExportFormat] = useState("json");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<Record<string, { imported: number; errors: number; skipped: number }> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    import("@/lib/supabase/client").then(({ createClient }) => {
      createClient().auth.getUser().then(({ data }) => {
        if (data.user) setEmail(data.user.email || "");
      });
    });
  }, []);

  const handleSignOut = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    window.location.href = "/auth/login";
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError("新密码至少需要 8 位。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("两次输入的密码不一致。");
      return;
    }

    setPasswordLoading(true);
    const { createClient } = await import("@/lib/supabase/client");
    const { error } = await createClient().auth.updateUser({ password: newPassword });
    setPasswordLoading(false);

    if (error) {
      setPasswordError(error.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("密码已更新，下次登录请使用新密码。");
  };

  const handleExport = () => {
    let url = `/api/data/export?type=${exportType}&format=${exportFormat}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    window.open(url, "_blank");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const text = await file.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        setImportError("无效的 JSON 文件");
        setImporting(false);
        return;
      }

      const res = await fetch("/api/data/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: exportType, data }),
      });
      const json = await res.json();
      if (json.data) {
        setImportResult(json.data);
      } else {
        setImportError(json.error || "导入失败");
      }
    } catch (err) {
      setImportError(String(err));
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const setLast30Days = () => {
    const end = new Date();
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  };

  const setLast7Days = () => {
    const end = new Date();
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  };

  const clearDates = () => {
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">设置</h1>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
        <h2 className="text-white font-medium">账户</h2>
        <div>
          <label className="block text-xs text-gray-400 mb-1">邮箱</label>
          <div className="text-white">{email || "加载中..."}</div>
        </div>
        <form onSubmit={handlePasswordUpdate} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"
              placeholder="至少 8 位"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"
              placeholder="再次输入"
            />
          </div>
          <button
            type="submit"
            disabled={passwordLoading || !newPassword || !confirmPassword}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900/50 disabled:text-blue-300/50 text-white rounded text-sm"
          >
            {passwordLoading ? "更新中..." : "修改密码"}
          </button>
        </form>
        {passwordError && <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{passwordError}</div>}
        {passwordMessage && <div className="bg-green-900/30 border border-green-800 rounded p-3 text-sm text-green-300">{passwordMessage}</div>}
        <button onClick={handleSignOut} className="px-4 py-2 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded text-sm">退出登录</button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
        <h2 className="text-white font-medium">导出数据</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">导出类型</label>
            <select value={exportType} onChange={(e) => setExportType(e.target.value)} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">
              <option value="full">完整备份</option>
              <option value="subscriptions">订阅</option>
              <option value="usage_logs">用量日志</option>
              <option value="billing">账单数据</option>
              <option value="prompt_templates">提示词模板</option>
              <option value="provider_config">供应商配置</option>
              <option value="cost_report">成本报告（含分析）</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">格式</label>
            <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-2">日期范围（可选）</label>
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">开始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">结束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"
              />
            </div>
            <div className="flex gap-1">
              <button onClick={setLast7Days} className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">7 天</button>
              <button onClick={setLast30Days} className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">30 天</button>
              <button onClick={clearDates} className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">清空</button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">
            下载导出
          </button>
          {exportType === "cost_report" && (
            <span className="text-xs text-gray-500">包含成本分析和每日明细</span>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
        <h2 className="text-white font-medium">导入数据</h2>
        <p className="text-xs text-gray-500">上传之前导出的 JSON 文件以恢复数据。ID 匹配的现有记录会被更新。</p>

        {importResult && (
          <div className="bg-green-900/30 border border-green-800 rounded p-3 text-sm space-y-1">
            <p className="text-green-300 font-medium">导入完成</p>
            {Object.entries(importResult).map(([table, result]) => (
              <p key={table} className="text-xs text-green-400">
                {table}: 已导入 {result.imported} 条，错误 {result.errors} 条{result.skipped > 0 ? `，跳过 ${result.skipped} 条` : ""}
              </p>
            ))}
          </div>
        )}

        {importError && (
          <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">{importError}</div>
        )}

        <div className="flex gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">导入类型</label>
            <select value={exportType} onChange={(e) => setExportType(e.target.value)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">
              <option value="full">完整恢复</option>
              <option value="subscriptions">订阅</option>
              <option value="prompt_templates">提示词模板</option>
              <option value="provider_config">供应商配置</option>
            </select>
          </div>
          <label className={`px-4 py-1.5 rounded text-sm cursor-pointer ${importing ? "bg-gray-700 text-gray-400" : "bg-green-700 hover:bg-green-600 text-white"}`}>
            {importing ? "导入中..." : "选择文件并导入"}
            <input ref={fileRef} type="file" accept=".json" onChange={handleImport} disabled={importing} className="hidden" />
          </label>
        </div>
      </div>

      <NotificationSettings />

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <h2 className="text-white font-medium">环境变量</h2>
        <div className="text-xs text-gray-500 space-y-1">
          <p>NEXT_PUBLIC_SUPABASE_URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? "已配置" : "未设置"}</p>
          <p>NEXT_PUBLIC_SUPABASE_ANON_KEY: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "已配置" : "未设置"}</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <h2 className="text-white font-medium">网关令牌用法</h2>
        <p className="text-xs text-gray-500">外部工具可以使用网关令牌调用 Rebol API 网关：</p>
        <pre className="bg-gray-800 rounded p-3 text-xs text-gray-300 overflow-x-auto font-mono">{`curl -X POST https://your-domain.com/api/gateway/chat \\
  -H "Authorization: Bearer rba_your_token_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "strategy": "balanced"
  }'`}</pre>
      </div>
    </div>
  );
}

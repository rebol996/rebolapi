"use client";

import { useState, useEffect, useRef } from "react";
import { FileUpload, type UploadedFile } from "@/components/file-upload";
import { formatDateTime, labelFor } from "@/lib/ui-labels";

const TASK_TYPES = [
  { value: "analyze", label: "分析" },
  { value: "review", label: "代码审查" },
  { value: "plan", label: "架构规划" },
  { value: "refactor", label: "重构" },
  { value: "bug_diagnosis", label: "问题诊断" },
  { value: "test_generation", label: "测试生成" },
  { value: "security_review", label: "安全审查" },
  { value: "performance_analysis", label: "性能分析" },
  { value: "pr_description", label: "PR 描述" },
  { value: "commit_message", label: "提交信息" },
  { value: "requirement_breakdown", label: "需求拆解" },
];

const STRATEGIES = [
  { value: "manual", label: "手动" },
  { value: "best_quality", label: "最佳质量" },
  { value: "lowest_cost", label: "最低成本" },
  { value: "fastest", label: "最快" },
  { value: "balanced", label: "均衡" },
];

interface ModelEndpoint {
  id: string;
  provider_model_id: string;
  models?: { display_name: string };
}

interface CompareResult {
  endpoint_id: string;
  model_name: string;
  content: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  latency_ms: number;
  rating: number | null;
  error?: string;
}

export default function WorkspacePage() {
  const [endpoints, setEndpoints] = useState<ModelEndpoint[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; task_type: string; user_prompt_template: string }>>([]);
  const [taskType, setTaskType] = useState("review");
  const [strategy, setStrategy] = useState("manual");
  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const [compareEndpoints, setCompareEndpoints] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [compareResults, setCompareResults] = useState<CompareResult[]>([]);
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [history, setHistory] = useState<Array<{ id: string; task_type: string; title: string | null; status: string; created_at: string; total_cost: number | null }>>([]);
  const outputRef = useRef<HTMLPreElement>(null);
  const initialized = useRef(false);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/usage-logs?limit=20");
      const json = await res.json();
      if (json.data) setHistory(json.data);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      fetch("/api/model-endpoints")
        .then((r) => r.json())
        .then((json) => setEndpoints((json.data || []).filter((e: Record<string, unknown>) => e.enabled && e.is_available)));

      fetch("/api/prompt-templates")
        .then((r) => r.json())
        .then((json) => setTemplates(json.data || []));

      fetchHistory();
    }
  }, []);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setTaskType(template.task_type);
      setInput(template.user_prompt_template);
    }
  };

  const handleFilesUploaded = (files: UploadedFile[]) => {
    setUploadedFiles(files);
    const fileContents = files.map((f) => `--- ${f.name} (${f.language}) ---\n${f.content}`).join("\n\n");
    setInput((prev) => {
      const base = prev.trim();
      return base ? `${base}\n\n${fileContents}` : fileContents;
    });
  };

  const handleRun = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setOutput("");
    setResult(null);
    setCompareResults([]);

    const body: Record<string, unknown> = {
      messages: [{ role: "user", content: input }],
      task_type: taskType,
      strategy,
      scan_sensitive: true,
    };

    if (strategy === "manual" && selectedEndpoint) {
      body.model_endpoint_id = selectedEndpoint;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.data) {
        setOutput(json.data.content);
        setResult(json.data);
        fetchHistory();
      } else {
        setOutput(`错误：${json.error || "未知错误"}${json.sensitive_scan ? "\n\n检测到敏感信息：" + JSON.stringify(json.sensitive_scan) : ""}`);
        setResult(json);
      }
    } catch (err) {
      setOutput(`网络错误：${err}`);
    }
    setLoading(false);
  };

  const handleCompare = async () => {
    if (!input.trim() || compareEndpoints.length === 0) return;
    setLoading(true);
    setCompareResults([]);
    setOutput("");

    const promises = compareEndpoints.map(async (endpointId): Promise<CompareResult> => {
      const endpoint = endpoints.find((e) => e.id === endpointId);
      const modelName = endpoint?.models?.display_name || endpoint?.provider_model_id || "未知";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: input }],
            model_endpoint_id: endpointId,
            task_type: taskType,
            strategy: "manual",
            scan_sensitive: true,
          }),
        });
        const json = await res.json();
        if (json.data) {
          return {
            endpoint_id: endpointId,
            model_name: modelName,
            content: json.data.content,
            input_tokens: json.data.input_tokens || 0,
            output_tokens: json.data.output_tokens || 0,
            cost: json.data.cost || 0,
            latency_ms: json.data.latency_ms || 0,
            rating: null,
          };
        }
        return {
          endpoint_id: endpointId,
          model_name: modelName,
          content: "",
          input_tokens: 0,
          output_tokens: 0,
          cost: 0,
          latency_ms: 0,
          rating: null,
          error: json.error || "未知错误",
        };
      } catch (err) {
        return {
          endpoint_id: endpointId,
          model_name: modelName,
          content: "",
          input_tokens: 0,
          output_tokens: 0,
          cost: 0,
          latency_ms: 0,
          rating: null,
          error: String(err),
        };
      }
    });

    const results = await Promise.all(promises);
    setCompareResults(results);
    setLoading(false);
    fetchHistory();
  };

  const handleRating = (endpointId: string, rating: number) => {
    setCompareResults((prev) =>
      prev.map((r) => (r.endpoint_id === endpointId ? { ...r, rating } : r))
    );
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const toggleCompareEndpoint = (endpointId: string) => {
    setCompareEndpoints((prev) =>
      prev.includes(endpointId)
        ? prev.filter((id) => id !== endpointId)
        : [...prev, endpointId]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">编码工作台</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
          >
            {showHistory ? "隐藏" : "显示"}历史
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        
        <select value={selectedTemplate} onChange={(e) => handleTemplateSelect(e.target.value)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          <option value="">选择模板...</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm">
          {STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {strategy === "manual" && mode === "single" && (
          <select value={selectedEndpoint} onChange={(e) => setSelectedEndpoint(e.target.value)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm max-w-xs">
            <option value="">选择端点...</option>
            {endpoints.map((e) => <option key={e.id} value={e.id}>{e.models?.display_name || e.provider_model_id}</option>)}
          </select>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("single")}
            className={`px-3 py-1.5 rounded text-sm ${mode === "single" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
          >
            单模型
          </button>
          <button
            onClick={() => setMode("compare")}
            className={`px-3 py-1.5 rounded text-sm ${mode === "compare" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
          >
            对比
          </button>
        </div>
      </div>

      {mode === "compare" && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
          <label className="text-sm text-gray-400 mb-2 block">选择要对比的端点：</label>
          <div className="flex flex-wrap gap-2">
            {endpoints.map((e) => (
              <button
                key={e.id}
                onClick={() => toggleCompareEndpoint(e.id)}
                className={`px-3 py-1.5 rounded text-xs ${
                  compareEndpoints.includes(e.id)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {e.models?.display_name || e.provider_model_id}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-400">输入</label>
            <button
              onClick={() => setShowFileUpload(!showFileUpload)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {showFileUpload ? "隐藏" : "上传文件"}
            </button>
          </div>
          {showFileUpload && (
            <FileUpload onFilesUploaded={handleFilesUploaded} />
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="粘贴代码、描述需求，或提出问题..."
            className="w-full h-96 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm font-mono resize-none"
          />
          <div className="flex gap-2">
            {mode === "single" ? (
              <button onClick={handleRun} disabled={loading || !input.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded text-sm">
                {loading ? "运行中..." : "运行任务"}
              </button>
            ) : (
              <button onClick={handleCompare} disabled={loading || !input.trim() || compareEndpoints.length === 0} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded text-sm">
                {loading ? "对比中..." : `对比（${compareEndpoints.length}）`}
              </button>
            )}
          </div>
        </div>
        
        {mode === "single" ? (
          <div className="space-y-2">
            <label className="text-sm text-gray-400">输出</label>
            <pre ref={outputRef} className="w-full h-96 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-gray-200 text-sm font-mono overflow-auto whitespace-pre-wrap">
              {output || "结果会显示在这里..."}
            </pre>
            {result && (
              <div className="flex gap-4 text-xs text-gray-500">
                <span>Token：{(result.input_tokens as number) || 0}/{(result.output_tokens as number) || 0}</span>
                <span>成本：${((result.cost as number) || 0).toFixed(6)}</span>
                <span>延迟：{(result.latency_ms as number) || 0}ms</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm text-gray-400">对比结果</label>
            {compareResults.length === 0 ? (
              <div className="w-full h-96 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                选择端点并运行对比...
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {compareResults.map((r) => (
                  <div key={r.endpoint_id} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{r.model_name}</span>
                        {r.error && <span className="text-xs text-red-400">错误</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleCopy(r.content)} className="text-xs text-gray-400 hover:text-white">复制</button>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              onClick={() => handleRating(r.endpoint_id, star)}
                              className={`text-xs ${r.rating && r.rating >= star ? "text-yellow-400" : "text-gray-600"}`}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {r.error ? (
                      <p className="text-xs text-red-400">{r.error}</p>
                    ) : (
                      <>
                        <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto mb-2">
                          {r.content}
                        </pre>
                        <div className="flex gap-3 text-xs text-gray-500">
                          <span>{r.input_tokens}/{r.output_tokens} Token</span>
                          <span>${r.cost.toFixed(6)}</span>
                          <span>{r.latency_ms}ms</span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showHistory && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">任务历史</h2>
          {history.length === 0 ? (
            <p className="text-xs text-gray-500">暂无最近任务</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {history.map((run) => (
                <div key={run.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        run.status === "completed" ? "bg-green-900/50 text-green-300" :
                        run.status === "failed" ? "bg-red-900/50 text-red-300" :
                        "bg-gray-800 text-gray-400"
                      }`}>{labelFor(run.status)}</span>
                      <span className="text-sm text-white">{run.title || labelFor(run.task_type)}</span>
                    </div>
                    {run.total_cost && (
                      <p className="text-xs text-gray-500 mt-0.5">${run.total_cost.toFixed(6)}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">{formatDateTime(run.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ModelEndpoint {
  id: string;
  provider_model_id: string;
  models?: { display_name: string };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface StreamResult {
  input_tokens?: number;
  output_tokens?: number;
  cost?: number;
  latency_ms?: number;
  endpoint_id?: string;
}

export default function ChatPage() {
  const [endpoints, setEndpoints] = useState<ModelEndpoint[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [result, setResult] = useState<StreamResult | null>(null);
  const [streamContent, setStreamContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/model-endpoints")
      .then((r) => r.json())
      .then((json) => setEndpoints((json.data || []).filter((e: Record<string, unknown>) => e.enabled && e.is_available)));
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 100);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !selectedEndpoint) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setLoading(true);
    setStreaming(true);
    setResult(null);
    setStreamContent("");

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          model_endpoint_id: selectedEndpoint,
          strategy: "manual",
          task_type: "chat",
          scan_sensitive: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errorData = await res.json();
        setMessages((prev) => [...prev, { role: "assistant", content: `错误：${errorData.error || "未知错误"}` }]);
        setStreaming(false);
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setMessages((prev) => [...prev, { role: "assistant", content: "错误：没有响应流" }]);
        setStreaming(false);
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));

            if (data.type === "start") {
              continue;
            } else if (data.type === "delta") {
              fullContent += data.content;
              setStreamContent(fullContent);
              scrollToBottom();
            } else if (data.type === "end") {
              setMessages((prev) => [...prev, { role: "assistant", content: fullContent }]);
              setResult({
                input_tokens: data.input_tokens,
                output_tokens: data.output_tokens,
                cost: data.cost,
                latency_ms: data.latency_ms,
                endpoint_id: data.endpoint_id,
              });
              setStreamContent("");
            } else if (data.type === "error") {
              setMessages((prev) => [...prev, { role: "assistant", content: `错误：${data.error}` }]);
              setStreamContent("");
            }
          } catch {
            continue;
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "assistant", content: `网络错误：${err.message}` }]);
      }
      setStreamContent("");
    }

    setStreaming(false);
    setLoading(false);
    scrollToBottom();
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (streamContent) {
      setMessages((prev) => [...prev, { role: "assistant", content: streamContent + " [已停止]" }]);
      setStreamContent("");
    }
    setStreaming(false);
    setLoading(false);
  };

  const handleClear = () => {
    setMessages([]);
    setResult(null);
    setStreamContent("");
  };

  return (
    <div className="space-y-4 h-[calc(100vh-3rem)] flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">聊天</h1>
        <div className="flex items-center gap-2">
          <select
            value={selectedEndpoint}
            onChange={(e) => setSelectedEndpoint(e.target.value)}
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm max-w-xs"
            disabled={loading}
          >
            <option value="">选择端点...</option>
            {endpoints.map((e) => (
              <option key={e.id} value={e.id}>
                {e.models?.display_name || e.provider_model_id}
              </option>
            ))}
          </select>
          <button
            onClick={handleClear}
            disabled={loading || messages.length === 0}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded text-sm"
          >
            清空
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3"
      >
        {messages.length === 0 && !streaming && (
          <p className="text-gray-500 text-sm">选择一个端点后开始聊天。</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`${msg.role === "user" ? "text-right" : ""}`}>
            <div
              className={`inline-block max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                msg.role === "user" ? "bg-blue-900/50 text-blue-100" : "bg-gray-800 text-gray-200"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {streaming && streamContent && (
          <div>
            <div className="inline-block max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap bg-gray-800 text-gray-200">
              {streamContent}
              <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-0.5" />
            </div>
          </div>
        )}
        {loading && !streamContent && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full" />
            思考中...
          </div>
        )}
      </div>

      {result && (
        <div className="flex gap-4 text-xs text-gray-500">
          <span>
            Token：{result.input_tokens || 0} / {result.output_tokens || 0}
          </span>
          <span>成本：${(result.cost || 0).toFixed(6)}</span>
          <span>延迟：{result.latency_ms || 0}ms</span>
          {result.endpoint_id && <span>端点：{result.endpoint_id.slice(0, 8)}...</span>}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !loading && handleSend()}
          placeholder={selectedEndpoint ? "输入消息..." : "请先选择端点"}
          disabled={!selectedEndpoint || loading}
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm disabled:opacity-50"
        />
        {streaming ? (
          <button
            onClick={handleStop}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
          >
            停止
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!selectedEndpoint || loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded text-sm"
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}

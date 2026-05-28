"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AlertCheckButton() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ checked: number; created: number } | null>(null);
  const router = useRouter();

  const handleCheck = async () => {
    setChecking(true);
    setResult(null);

    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (data.data) {
        setResult(data.data);
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to check alerts:", err);
    }

    setChecking(false);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleCheck}
        disabled={checking}
        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded text-sm flex items-center gap-2"
      >
        {checking ? (
          <>
            <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
            检查中...
          </>
        ) : (
          <>
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            检查告警
          </>
        )}
      </button>
      {result && (
        <span className="text-xs text-gray-400">
          {result.created > 0 ? (
            <span className="text-yellow-400">新增 {result.created} 个告警</span>
          ) : (
            <span className="text-green-400">没有新告警</span>
          )}
        </span>
      )}
    </div>
  );
}

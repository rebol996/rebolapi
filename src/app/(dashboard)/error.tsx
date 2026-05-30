"use client";

import { useEffect } from "react";

/**
 * Next.js error boundary for the dashboard route group.
 * Catches both rendering errors and unhandled exceptions in dashboard pages.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8">
      <div className="text-5xl">💥</div>
      <h2 className="text-xl font-semibold text-gray-200">出错了</h2>
      <p className="text-gray-400 text-center max-w-md text-sm">
        {error.message || "发生了未知错误"}
      </p>
      {error.digest && (
        <p className="text-xs text-gray-600">错误 ID: {error.digest}</p>
      )}
      <div className="flex gap-3 mt-2">
        <button
          onClick={reset}
          className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
        >
          重试
        </button>
        <button
          onClick={() => (window.location.href = "/")}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          返回首页
        </button>
      </div>
    </div>
  );
}

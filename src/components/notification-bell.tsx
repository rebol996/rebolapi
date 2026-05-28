"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { notificationManager } from "@/lib/notifications/manager";
import { formatDateTime, labelFor } from "@/lib/ui-labels";

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  created_at: string;
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const initialized = useRef(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      if (data.data) {
        const openAlerts = data.data.filter((a: Alert & { status: string }) => a.status === "open");
        setAlerts(openAlerts);
      }
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    }
  }, []);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      fetchAlerts();
    }
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const handleCheckAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts", { method: "POST" });
      const data = await res.json();
      
      if (data.data?.created > 0) {
        const newAlerts = data.data.alerts || [];
        await notificationManager.sendBatchNotifications(newAlerts);
      }
      
      await fetchAlerts();
      router.refresh();
    } catch (err) {
      console.error("Failed to check alerts:", err);
    }
    setLoading(false);
  };

  const handleDismissAlert = async (alertId: string, status: "acknowledged" | "resolved" | "ignored") => {
    try {
      await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alertId, status }),
      });
      await fetchAlerts();
      router.refresh();
    } catch (err) {
      console.error("Failed to dismiss alert:", err);
    }
  };

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;
  const totalCount = alerts.length;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-900/50 text-red-300 border-red-800";
      case "warning":
        return "bg-yellow-900/50 text-yellow-300 border-yellow-800";
      default:
        return "bg-blue-900/50 text-blue-300 border-blue-800";
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-50">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-white">告警</h3>
              <p className="text-xs text-gray-500">
                {criticalCount > 0 && <span className="text-red-400">{criticalCount} 个严重</span>}
                {criticalCount > 0 && warningCount > 0 && " · "}
                {warningCount > 0 && <span className="text-yellow-400">{warningCount} 个警告</span>}
                {totalCount === 0 && "暂无未处理告警"}
              </p>
            </div>
            <button
              onClick={handleCheckAlerts}
              disabled={loading}
              className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 text-gray-300 rounded"
            >
              {loading ? "..." : "检查"}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">暂无未处理告警</div>
            ) : (
              alerts.slice(0, 10).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${getSeverityColor(alert.severity)}`}>
                          {labelFor(alert.severity)}
                        </span>
                        <span className="text-sm text-white truncate">{alert.title}</span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">{alert.message}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {formatDateTime(alert.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDismissAlert(alert.id, "acknowledged")}
                        className="p-1 text-gray-500 hover:text-yellow-400"
                        title="确认"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDismissAlert(alert.id, "resolved")}
                        className="p-1 text-gray-500 hover:text-green-400"
                        title="解决"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {alerts.length > 0 && (
            <div className="p-2 border-t border-gray-800">
              <button
                onClick={() => {
                  setShowDropdown(false);
                  router.push("/alerts");
                }}
                className="w-full px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
              >
                查看全部告警
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

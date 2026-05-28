"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { notificationManager } from "@/lib/notifications/manager";

export function NotificationSettings() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<"granted" | "denied" | "default">("default");
  const [testing, setTesting] = useState(false);
  const initialized = useRef(false);

  const updatePermission = useCallback(() => {
    setSupported(notificationManager.isSupported());
    const perm = notificationManager.getPermission();
    if (perm.granted) setPermission("granted");
    else if (perm.denied) setPermission("denied");
    else setPermission("default");
  }, []);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      updatePermission();
    }
  }, [updatePermission]);

  const handleRequestPermission = async () => {
    const granted = await notificationManager.requestPermission();
    updatePermission();
    if (granted) {
      handleTestNotification();
    }
  };

  const handleTestNotification = async () => {
    setTesting(true);
    await notificationManager.sendNotification({
      title: "Rebol API 通知",
      body: "通知已正常工作。你会在这里收到告警。",
      tag: "test-notification",
      data: { type: "test" },
    });
    setTesting(false);
  };

  const handleClearNotifications = () => {
    notificationManager.clearAllNotifications();
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-medium text-white mb-4">通知设置</h3>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300">浏览器通知</p>
            <p className="text-xs text-gray-500">
              {supported
                ? permission === "granted"
                  ? "通知已启用"
                  : permission === "denied"
                  ? "通知已被浏览器阻止"
                  : "点击启用通知"
                : "当前浏览器不支持通知"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {permission === "granted" ? (
              <span className="px-2 py-1 bg-green-900/50 text-green-300 text-xs rounded">已启用</span>
            ) : permission === "denied" ? (
              <span className="px-2 py-1 bg-red-900/50 text-red-300 text-xs rounded">已阻止</span>
            ) : (
              <button
                onClick={handleRequestPermission}
                disabled={!supported}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded text-sm"
              >
                启用
              </button>
            )}
          </div>
        </div>

        {permission === "granted" && (
          <div className="flex gap-2">
            <button
              onClick={handleTestNotification}
              disabled={testing}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded text-sm"
            >
              {testing ? "发送中..." : "测试通知"}
            </button>
            <button
              onClick={handleClearNotifications}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
            >
              全部清除
            </button>
          </div>
        )}

        <div className="border-t border-gray-800 pt-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">告警类型</h4>
          <div className="space-y-2">
            <AlertTypeRow
              label="严重告警"
              description="预算超限、API 密钥失败"
              enabled={permission === "granted"}
            />
            <AlertTypeRow
              label="警告告警"
              description="额度不足、预算警告"
              enabled={permission === "granted"}
            />
            <AlertTypeRow
              label="信息告警"
              description="订阅续费、未使用订阅"
              enabled={permission === "granted"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertTypeRow({ label, description, enabled }: { label: string; description: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-300">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <div className={`w-3 h-3 rounded-full ${enabled ? "bg-green-500" : "bg-gray-600"}`} />
    </div>
  );
}

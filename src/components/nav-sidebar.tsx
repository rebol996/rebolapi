"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NotificationBell } from "./notification-bell";
import { warmJson } from "@/lib/client/api-cache";

const NAV_ITEMS = [
  { href: "/", label: "仪表盘", icon: "◉", api: ["/api/alerts", "/api/analytics?type=summary&period=monthly"] },
  { href: "/subscriptions", label: "订阅", icon: "◆", api: ["/api/subscriptions"] },
  { href: "/api-keys", label: "API 密钥", icon: "⚷", api: ["/api/api-keys", "/api/subscriptions", "/api/providers"] },
  { href: "/providers", label: "供应商", icon: "⊞", api: ["/api/providers"] },
  { href: "/models", label: "模型", icon: "⊓", api: ["/api/models"] },
  { href: "/model-endpoints", label: "端点", icon: "⊘", api: ["/api/model-endpoints"] },
  { href: "/workspace", label: "工作台", icon: "✎", api: ["/api/model-endpoints", "/api/prompt-templates", "/api/usage-logs?limit=20"] },
  { href: "/chat", label: "聊天", icon: "◈", api: ["/api/model-endpoints"] },
  { href: "/prompt-templates", label: "模板", icon: "▢", api: ["/api/prompt-templates"] },
  { href: "/usage-logs", label: "用量日志", icon: "▤", api: ["/api/usage-logs"] },
  { href: "/budgets", label: "预算", icon: "⊕", api: ["/api/budgets"] },
  { href: "/alerts", label: "告警", icon: "⚠", api: ["/api/alerts"] },
  { href: "/gateway-tokens", label: "网关令牌", icon: "◗", api: ["/api/gateway-tokens"] },
  { href: "/settings", label: "设置", icon: "⚙", api: [] },
];

export default function NavSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const warmRoute = (href: string, apiPaths: string[]) => {
    router.prefetch(href);
    apiPaths.forEach((apiPath) => {
      warmJson(apiPath);
    });
  };

  const handleSignOut = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    window.location.href = "/auth/login";
  };

  return (
    <aside className="w-52 min-h-screen bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Rebol API</h1>
          <p className="text-xs text-gray-500">模型控制中心</p>
        </div>
        <NotificationBell />
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onMouseEnter={() => warmRoute(item.href, item.api)}
              onFocus={() => warmRoute(item.href, item.api)}
              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-gray-800 text-white border-l-2 border-blue-500"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              }`}
            >
              <span className="text-xs opacity-60">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-800">
        <button
          onClick={handleSignOut}
          className="w-full text-left text-sm text-gray-400 hover:text-white transition-colors"
        >
          退出登录
        </button>
      </div>
    </aside>
  );
}

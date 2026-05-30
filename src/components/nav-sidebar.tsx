"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NotificationBell } from "./notification-bell";
import { warmJson } from "@/lib/client/api-cache";

const NAV_ITEMS = [
  { href: "/account-pool", label: "资产", icon: "⬡", api: ["/api/account-pool"] },
  { href: "/asset-models", label: "模型", icon: "⊓", api: ["/api/asset-models"] },
  { href: "/gateway-keys", label: "网关密钥", icon: "🔑", api: ["/api/gateway-tokens"] },
  { href: "/consumption", label: "消耗", icon: "📊", api: ["/api/usage-logs"] },
  { href: "/alerts", label: "提醒", icon: "⚠", api: ["/api/alerts"] },
  { href: "/chat", label: "聊天", icon: "◈", api: ["/api/model-endpoints"] },
  { href: "/settings", label: "设置", icon: "⚙", api: [] },
  { href: "/import", label: "导入", icon: "↓", api: [] },
];

const ADVANCED_ITEMS = [
  { href: "/", label: "仪表盘", icon: "◉", api: [] },
  { href: "/subscriptions", label: "订阅管理", icon: "◆", api: [] },
  { href: "/api-keys", label: "API 密钥", icon: "⚷", api: [] },
  { href: "/providers", label: "供应商", icon: "⊞", api: [] },
  { href: "/models", label: "模型管理", icon: "⊓", api: [] },
  { href: "/model-endpoints", label: "端点管理", icon: "⊘", api: [] },
  { href: "/model-discoveries", label: "发现历史", icon: "⊡", api: [] },
  { href: "/prompt-templates", label: "模板", icon: "▢", api: [] },
  { href: "/budgets", label: "预算", icon: "⊕", api: [] },
  { href: "/workspace", label: "工作台", icon: "✎", api: [] },
];

export default function NavSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const fetchName = () => {
      import("@/lib/supabase/client").then(({ createClient }) => {
        createClient().auth.getUser().then(({ data }) => {
          if (data.user) {
            const name = (data.user.user_metadata?.name as string) || (data.user.user_metadata?.full_name as string) || "";
            setDisplayName(name);
          }
        });
      });
    };
    fetchName();
    const handler = () => fetchName();
    window.addEventListener("account-name-updated", handler);
    return () => window.removeEventListener("account-name-updated", handler);
  }, []);

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

  const closeMobile = () => setMobileOpen(false);

  const sidebarContent = (
    <>
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
              onClick={closeMobile}
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
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <span className="text-xs opacity-60">{showAdvanced ? "▾" : "▸"}</span>
          高级
        </button>
        {showAdvanced && ADVANCED_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onClick={closeMobile}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs transition-colors ${
                isActive
                  ? "bg-gray-800 text-white border-l-2 border-blue-500"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
              }`}
            >
              <span className="text-xs opacity-60">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-800 space-y-3">
        {displayName && (
          <div className="text-sm text-gray-300 truncate">{displayName}</div>
        )}
        <button
          onClick={handleSignOut}
          className="w-full text-left text-sm text-gray-400 hover:text-white transition-colors"
        >
          退出登录
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:text-white"
        aria-label="打开菜单"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={closeMobile} />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
            <button onClick={closeMobile} className="absolute top-3 right-3 p-1 text-gray-500 hover:text-white" aria-label="关闭菜单">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-52 min-h-screen bg-gray-900 border-r border-gray-800 flex-col">
        {sidebarContent}
      </aside>
    </>
  );
}

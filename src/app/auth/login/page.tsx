"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getSupabase = () => createClient();

  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null;
  const urlError = searchParams?.get("error");

  const errorMessage = (message: string) => {
    if (message.includes("Invalid login credentials")) return "邮箱或密码不正确。";
    if (message.includes("Email rate limit exceeded")) return "邮件发送太频繁，请稍后再试。";
    return message;
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await getSupabase().auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(errorMessage(error.message));
    } else {
      window.location.href = "/";
    }
    setLoading(false);
  };

  const handleMagicLink = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(errorMessage(error.message));
    } else {
      setMessage("登录链接已发送，请查看邮箱。");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm mx-4 p-6 sm:p-8 bg-gray-900 rounded-lg border border-gray-800">
        <h1 className="text-2xl font-bold text-white mb-2">Rebol API</h1>
        <p className="text-gray-400 mb-6 text-sm">登录你的控制中心</p>

        {urlError === "access_denied" && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-800 rounded text-red-300 text-sm">
            访问被拒绝。该邮箱未被授权。
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-800 rounded text-red-300 text-sm">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-green-900/50 border border-green-800 rounded text-green-300 text-sm">
            {message}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 rounded bg-gray-800 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`rounded px-3 py-1.5 ${mode === "password" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            密码登录
          </button>
          <button
            type="button"
            onClick={() => setMode("magic")}
            className={`rounded px-3 py-1.5 ${mode === "magic" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            邮件链接
          </button>
        </div>

        <form onSubmit={handlePasswordLogin}>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            邮箱
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500 mb-4"
            placeholder="请输入邮箱"
          />
          {mode === "password" && (
            <>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500 mb-4"
                placeholder="请输入密码"
              />
            </>
          )}
          <button
            type="submit"
            disabled={loading || mode !== "password"}
            className={`w-full py-2 px-4 rounded text-sm font-medium transition-colors ${
              mode === "password"
                ? "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white"
                : "bg-gray-800 text-gray-500"
            }`}
          >
            {loading && mode === "password" ? "登录中..." : "登录"}
          </button>
          {mode === "magic" && (
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading || !email}
              className="mt-3 w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded text-sm font-medium transition-colors"
            >
              {loading ? "发送中..." : "发送登录链接"}
            </button>
          )}
          <p className="mt-4 text-xs text-gray-500">
            密码由 Supabase Auth 管理；后台仅允许授权邮箱登录。
          </p>
        </form>
      </div>
    </div>
  );
}

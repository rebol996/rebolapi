"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getSupabase = () => createClient();

  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null;
  const urlError = searchParams?.get("error");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setError(error.message);
    } else {
      setMessage("请查看邮箱中的登录链接。");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm p-8 bg-gray-900 rounded-lg border border-gray-800">
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

        <form onSubmit={handleLogin}>
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
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded text-sm font-medium transition-colors"
          >
            {loading ? "发送中..." : "发送登录链接"}
          </button>
        </form>
      </div>
    </div>
  );
}

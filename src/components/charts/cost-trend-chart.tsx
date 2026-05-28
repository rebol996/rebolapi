"use client";

import { useEffect, useState } from "react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, BarChart, Bar, Cell, PieChart, Pie } from "recharts";
import { LoadingSpinner, EmptyState } from "@/components/ui/loading-spinner";

interface CostTrendData {
  date: string;
  cost: number;
  call_count: number;
}

interface CostTrendChartProps {
  days?: number;
  height?: number;
}

function CostTrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { call_count: number } }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-lg">
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <p className="text-sm text-white font-medium">${payload[0].value.toFixed(6)}</p>
        <p className="text-xs text-gray-400">{payload[0].payload.call_count} 次调用</p>
      </div>
    );
  }
  return null;
}

export function CostTrendChart({ days = 30, height = 300 }: CostTrendChartProps) {
  const [data, setData] = useState<CostTrendData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics?type=trend&days=${days}`);
        const json = await res.json();
        if (json.data) {
          setData(json.data.map((d: CostTrendData) => ({
            ...d,
            date: new Date(d.date).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }),
            cost: Math.round(d.cost * 1000000) / 1000000,
          })));
        }
      } catch (err) {
        console.error("Failed to fetch cost trend:", err);
      }
      setLoading(false);
    };

    fetchData();
  }, [days]);

  if (loading) {
    return <LoadingSpinner className={``} />;
  }

  if (data.length === 0) {
    return <EmptyState message="暂无成本数据" icon="📊" />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="date"
          stroke="#6B7280"
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          stroke="#6B7280"
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          tickLine={false}
          tickFormatter={(value) => `$${value.toFixed(2)}`}
        />
        <Tooltip content={<CostTrendTooltip />} />
        <Area
          type="monotone"
          dataKey="cost"
          stroke="#3B82F6"
          strokeWidth={2}
          fill="url(#costGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface ProviderCostData {
  provider_name: string;
  total_cost: number;
  call_count: number;
}

interface ProviderCostChartProps {
  days?: number;
  height?: number;
}

function ProviderCostTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ProviderCostData }> }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-lg">
        <p className="text-sm text-white font-medium mb-1">{data.provider_name}</p>
        <p className="text-xs text-gray-400">${data.total_cost.toFixed(6)}</p>
        <p className="text-xs text-gray-400">{data.call_count} 次调用</p>
      </div>
    );
  }
  return null;
}

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"];

export function ProviderCostChart({ days = 30, height = 300 }: ProviderCostChartProps) {
  const [data, setData] = useState<ProviderCostData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics?type=by-provider&days=${days}`);
        const json = await res.json();
        if (json.data) {
          setData(json.data.slice(0, 10));
        }
      } catch (err) {
        console.error("Failed to fetch provider costs:", err);
      }
      setLoading(false);
    };

    fetchData();
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-sm" style={{ height }}>
        暂无数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="provider_name"
          stroke="#6B7280"
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          stroke="#6B7280"
          tick={{ fill: "#9CA3AF", fontSize: 11 }}
          tickLine={false}
          tickFormatter={(value) => `$${value.toFixed(2)}`}
        />
        <Tooltip content={<ProviderCostTooltip />} />
        <Bar dataKey="total_cost" radius={[4, 4, 0, 0]}>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface ModelCostData {
  model_name: string;
  provider_name: string;
  total_cost: number;
  call_count: number;
}

interface ModelCostChartProps {
  days?: number;
  height?: number;
}

function ModelCostTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ModelCostData }> }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-lg">
        <p className="text-sm text-white font-medium mb-1">{data.model_name}</p>
        <p className="text-xs text-gray-400">{data.provider_name}</p>
        <p className="text-xs text-gray-400">${data.total_cost.toFixed(6)}</p>
        <p className="text-xs text-gray-400">{data.call_count} 次调用</p>
      </div>
    );
  }
  return null;
}

export function ModelCostChart({ days = 30, height = 300 }: ModelCostChartProps) {
  const [data, setData] = useState<ModelCostData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics?type=by-model&days=${days}`);
        const json = await res.json();
        if (json.data) {
          setData(json.data.slice(0, 10));
        }
      } catch (err) {
        console.error("Failed to fetch model costs:", err);
      }
      setLoading(false);
    };

    fetchData();
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-sm" style={{ height }}>
        暂无数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="total_cost"
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ModelCostTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

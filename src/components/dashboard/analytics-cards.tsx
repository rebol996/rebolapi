"use client";

import { useEffect, useState } from "react";
import { labelFor } from "@/lib/ui-labels";

interface CostSummary {
  total_cost: number;
  api_usage_cost: number;
  subscription_cost: number;
  call_count: number;
  avg_cost_per_call: number;
}

interface UpcomingRenewal {
  subscription_id: string;
  platform: string;
  plan_name: string;
  alias: string | null;
  renewal_date: string;
  price: number | null;
  currency: string;
  days_until: number;
}

interface EndpointHealth {
  endpoint_id: string;
  model_name: string;
  provider_name: string;
  health_score: number;
  success_rate: number;
  avg_latency_ms: number;
  total_calls: number;
  consecutive_failures: number;
}

export function CostSummaryCard() {
  const [data, setData] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics?type=summary&period=monthly")
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setData(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-800 rounded w-1/3 mb-3" />
        <div className="h-8 bg-gray-800 rounded w-1/2" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm text-gray-400 mb-2">本月成本</h3>
      <p className="text-3xl font-bold text-white">${data.total_cost.toFixed(2)}</p>
      <div className="mt-3 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">API 用量</span>
          <span className="text-gray-300">${data.api_usage_cost.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">订阅</span>
          <span className="text-gray-300">${data.subscription_cost.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">调用次数</span>
          <span className="text-gray-300">{data.call_count}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">平均每次成本</span>
          <span className="text-gray-300">${data.avg_cost_per_call.toFixed(6)}</span>
        </div>
      </div>
    </div>
  );
}

export function UpcomingRenewalsCard() {
  const [renewals, setRenewals] = useState<UpcomingRenewal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics?type=upcoming-renewals&days=30")
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setRenewals(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-800 rounded w-1/3 mb-3" />
        <div className="space-y-2">
          <div className="h-6 bg-gray-800 rounded" />
          <div className="h-6 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm text-gray-400 mb-3">即将续费</h3>
      {renewals.length === 0 ? (
        <p className="text-xs text-gray-500">未来 30 天暂无续费</p>
      ) : (
        <div className="space-y-2">
          {renewals.slice(0, 5).map((renewal) => (
            <div key={renewal.subscription_id} className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">{renewal.alias || renewal.platform}</p>
                <p className="text-xs text-gray-500">{renewal.plan_name}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-medium ${
                  renewal.days_until <= 3 ? "text-red-400" :
                  renewal.days_until <= 7 ? "text-yellow-400" :
                  "text-gray-300"
                }`}>
                  {renewal.days_until} 天
                </p>
                {renewal.price && (
                  <p className="text-xs text-gray-500">${renewal.price}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EndpointHealthCard() {
  const [endpoints, setEndpoints] = useState<EndpointHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics?type=endpoint-health")
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setEndpoints(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-800 rounded w-1/3 mb-3" />
        <div className="space-y-2">
          <div className="h-6 bg-gray-800 rounded" />
          <div className="h-6 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  const getHealthColor = (score: number) => {
    if (score >= 90) return "text-green-400";
    if (score >= 70) return "text-yellow-400";
    return "text-red-400";
  };

  const getHealthBg = (score: number) => {
    if (score >= 90) return "bg-green-900/30";
    if (score >= 70) return "bg-yellow-900/30";
    return "bg-red-900/30";
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm text-gray-400 mb-3">端点健康状态</h3>
      {endpoints.length === 0 ? (
        <p className="text-xs text-gray-500">暂无可用端点</p>
      ) : (
        <div className="space-y-2">
          {endpoints.slice(0, 5).map((ep) => (
            <div key={ep.endpoint_id} className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">{ep.model_name}</p>
                <p className="text-xs text-gray-500">{ep.provider_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${getHealthBg(ep.health_score)} ${getHealthColor(ep.health_score)}`}>
                  {ep.health_score.toFixed(0)}%
                </span>
                <span className="text-xs text-gray-500">{ep.avg_latency_ms}ms</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskRun {
  id: string;
  task_type: string;
  title: string | null;
  status: string;
  total_cost: number | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  created_at: string;
}

export function RecentTaskRunsCard() {
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/usage-logs?limit=5")
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setRuns(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-800 rounded w-1/3 mb-3" />
        <div className="space-y-2">
          <div className="h-6 bg-gray-800 rounded" />
          <div className="h-6 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-900/50 text-green-300";
      case "failed":
        return "bg-red-900/50 text-red-300";
      case "running":
        return "bg-blue-900/50 text-blue-300";
      default:
        return "bg-gray-800 text-gray-400";
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm text-gray-400 mb-3">最近任务</h3>
      {runs.length === 0 ? (
        <p className="text-xs text-gray-500">暂无最近任务</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(run.status)}`}>
                    {labelFor(run.status)}
                  </span>
                  <span className="text-sm text-white">{run.title || run.task_type}</span>
                </div>
                {run.total_cost && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    ${run.total_cost.toFixed(6)} · {run.total_input_tokens || 0}/{run.total_output_tokens || 0} Token
                  </p>
                )}
              </div>
              <span className="text-xs text-gray-500">
                {new Date(run.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

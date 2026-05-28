import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: HealthCheck;
    providers: HealthCheck;
    endpoints: HealthCheck;
    alerts: HealthCheck;
  };
  summary: {
    total_endpoints: number;
    healthy_endpoints: number;
    unhealthy_endpoints: number;
    open_alerts: number;
    critical_alerts: number;
  };
}

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  message: string;
  details?: Record<string, unknown>;
  latency_ms?: number;
}

const startTime = Date.now();

export async function GET() {
  const supabase = await createClient();

  const checks: HealthCheckResult["checks"] = {
    database: await checkDatabase(supabase),
    providers: await checkProviders(supabase),
    endpoints: await checkEndpoints(supabase),
    alerts: await checkAlerts(supabase),
  };

  const summary = {
    total_endpoints: checks.endpoints.details?.total as number || 0,
    healthy_endpoints: checks.endpoints.details?.healthy as number || 0,
    unhealthy_endpoints: checks.endpoints.details?.unhealthy as number || 0,
    open_alerts: checks.alerts.details?.open as number || 0,
    critical_alerts: checks.alerts.details?.critical as number || 0,
  };

  const overallStatus = determineOverallStatus(checks);

  const result: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "0.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
    summary,
  };

  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

  return NextResponse.json(result, { status: statusCode });
}

async function checkDatabase(supabase: Awaited<ReturnType<typeof createClient>>): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { error } = await supabase.from("providers").select("id").limit(1);
    const latency = Date.now() - start;

    if (error) {
      return {
        status: "unhealthy",
        message: `Database error: ${error.message}`,
        latency_ms: latency,
      };
    }

    return {
      status: latency > 1000 ? "degraded" : "healthy",
      message: latency > 1000 ? "Database is slow" : "Database is responsive",
      latency_ms: latency,
    };
  } catch (err) {
    return {
      status: "unhealthy",
      message: `Database connection failed: ${err}`,
      latency_ms: Date.now() - start,
    };
  }
}

async function checkProviders(supabase: Awaited<ReturnType<typeof createClient>>): Promise<HealthCheck> {
  try {
    const { data, error } = await supabase
      .from("providers")
      .select("id, status")
      .eq("status", "active");

    if (error) {
      return {
        status: "unhealthy",
        message: `Failed to fetch providers: ${error.message}`,
      };
    }

    const total = data?.length || 0;

    return {
      status: "healthy",
      message: `${total} active provider(s)`,
      details: { active: total },
    };
  } catch (err) {
    return {
      status: "unhealthy",
      message: `Provider check failed: ${err}`,
    };
  }
}

async function checkEndpoints(supabase: Awaited<ReturnType<typeof createClient>>): Promise<HealthCheck> {
  try {
    const { data, error } = await supabase
      .from("model_endpoints")
      .select("id, enabled, is_available, health_score, consecutive_failures");

    if (error) {
      return {
        status: "unhealthy",
        message: `Failed to fetch endpoints: ${error.message}`,
      };
    }

    const total = data?.length || 0;
    const enabled = data?.filter((e) => e.enabled).length || 0;
    const available = data?.filter((e) => e.enabled && e.is_available).length || 0;
    const healthy = data?.filter((e) => e.enabled && e.is_available && e.health_score >= 50).length || 0;
    const unhealthy = data?.filter((e) => e.enabled && e.is_available && e.health_score < 50).length || 0;
    const critical = data?.filter((e) => e.enabled && e.is_available && e.consecutive_failures >= 5).length || 0;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (unhealthy > 0 || critical > 0) {
      status = critical > 0 ? "unhealthy" : "degraded";
    }

    return {
      status,
      message: `${available}/${enabled} endpoints available, ${healthy} healthy`,
      details: { total, enabled, available, healthy, unhealthy, critical },
    };
  } catch (err) {
    return {
      status: "unhealthy",
      message: `Endpoint check failed: ${err}`,
    };
  }
}

async function checkAlerts(supabase: Awaited<ReturnType<typeof createClient>>): Promise<HealthCheck> {
  try {
    const { data, error } = await supabase
      .from("alerts")
      .select("id, severity, status")
      .eq("status", "open");

    if (error) {
      return {
        status: "unhealthy",
        message: `Failed to fetch alerts: ${error.message}`,
      };
    }

    const open = data?.length || 0;
    const critical = data?.filter((a) => a.severity === "critical").length || 0;
    const warning = data?.filter((a) => a.severity === "warning").length || 0;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (critical > 0) {
      status = "unhealthy";
    } else if (warning > 5) {
      status = "degraded";
    }

    return {
      status,
      message: `${open} open alerts (${critical} critical, ${warning} warnings)`,
      details: { open, critical, warning },
    };
  } catch (err) {
    return {
      status: "unhealthy",
      message: `Alert check failed: ${err}`,
    };
  }
}

function determineOverallStatus(checks: HealthCheckResult["checks"]): "healthy" | "degraded" | "unhealthy" {
  const statuses = Object.values(checks).map((c) => c.status);

  if (statuses.includes("unhealthy")) {
    return "unhealthy";
  }

  if (statuses.includes("degraded")) {
    return "degraded";
  }

  return "healthy";
}

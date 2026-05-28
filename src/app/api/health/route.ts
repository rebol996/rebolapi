import { NextResponse } from "next/server";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    env: HealthCheck;
    database: HealthCheck;
  };
}

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  message: string;
  latency_ms?: number;
}

const startTime = Date.now();

export async function GET() {
  const checks: HealthCheckResult["checks"] = {
    env: checkEnv(),
    database: await checkDatabase(),
  };

  const statuses = Object.values(checks).map((c) => c.status);
  const overallStatus = statuses.includes("unhealthy") ? "unhealthy" : statuses.includes("degraded") ? "degraded" : "healthy";

  const result: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "0.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };

  return NextResponse.json(result, { status: overallStatus === "unhealthy" ? 503 : 200 });
}

function checkEnv(): HealthCheck {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    const missing = [];
    if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!key) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return { status: "unhealthy", message: `Missing env: ${missing.join(", ")}` };
  }

  return { status: "healthy", message: "Environment configured" };
}

async function checkDatabase(): Promise<HealthCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { status: "unhealthy", message: "Cannot check: env not configured" };
  }

  const start = Date.now();
  try {
    const res = await fetch(`${url}/rest/v1/?apikey=${key}`, {
      method: "GET",
      headers: { apikey: key },
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;

    if (!res.ok) {
      return { status: "unhealthy", message: `Database responded ${res.status}`, latency_ms: latency };
    }

    return {
      status: latency > 2000 ? "degraded" : "healthy",
      message: latency > 2000 ? "Database is slow" : "Database is responsive",
      latency_ms: latency,
    };
  } catch (err) {
    return { status: "unhealthy", message: `Database unreachable: ${err}`, latency_ms: Date.now() - start };
  }
}

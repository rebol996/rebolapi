/**
 * API route handler utilities.
 *
 * Eliminates duplicated auth, JSON parsing, and error handling
 * across ~35 route files while keeping the code easy to read.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { formatDatabaseError } from "@/lib/security/error-handler";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context passed into every route handler (auth + supabase already resolved). */
export interface ApiContext {
  user: User;
  supabase: SupabaseClient;
}

/** Standard Next.js route handler params */
export type RouteParams = { params: Promise<Record<string, string>> };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse JSON body from a request.
 * Returns `null` (with a pre-built error response) when parsing fails.
 */
export async function parseJsonBody(
  request: Request,
): Promise<{ body: Record<string, unknown> } | { error: NextResponse }> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return { body };
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
}

/**
 * Build an UPDATE-safe payload from a request body, keeping only allowed fields.
 */
export function pickFields(
  body: Record<string, unknown>,
  allowed: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of allowed) {
    if (body[field] !== undefined) {
      result[field] = body[field];
    }
  }
  return result;
}

/**
 * Handle Supabase errors consistently.
 * - 404 for "not found" PGRST errors
 * - 409 for unique constraint violations
 * - 500 for everything else (message hidden in production)
 */
export function handleDbError(
  error: { code?: string; message?: string; details?: string },
  fallbackStatus = 500,
): NextResponse {
  console.error("[DB Error]", error.code, error.message, error.details);

  // Common PostgREST error: no rows returned → treat as 404
  if (error.code === "PGRST116") {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const { message, status } = formatDatabaseError(error);
  return NextResponse.json({ error: message }, { status: fallbackStatus !== 500 ? fallbackStatus : status });
}

// ---------------------------------------------------------------------------
// High-order wrappers
// ---------------------------------------------------------------------------

type HandlerFn<T = unknown> = (ctx: ApiContext, request: Request) => Promise<T>;
type HandlerWithParamsFn<T = unknown> = (ctx: ApiContext, request: Request, params: Record<string, string>) => Promise<T>;

/**
 * Wrap a plain route handler (GET / POST) with authentication.
 *
 * Usage:
 * ```ts
 * export const GET = withAuth(async ({ user, supabase }) => {
 *   const { data, error } = await supabase.from("providers").select("*").eq("user_id", user.id);
 *   if (error) return handleDbError(error);
 *   return NextResponse.json({ data });
 * });
 * ```
 */
export function withAuth<T = unknown>(handler: HandlerFn<T>) {
  return async (request: Request) => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler({ user, supabase }, request);
  };
}

/**
 * Wrap a route handler that needs URL params (GET / PUT / DELETE on /[id]).
 *
 * Usage:
 * ```ts
 * export const GET = withAuthParams(async ({ user, supabase }, _req, { id }) => {
 *   const { data, error } = await supabase.from("providers").select("*").eq("id", id).eq("user_id", user.id).single();
 *   if (error) return handleDbError(error, 404);
 *   return NextResponse.json({ data });
 * });
 * ```
 */
export function withAuthParams<T = unknown>(handler: HandlerWithParamsFn<T>) {
  return async (request: Request, { params }: RouteParams) => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const resolved = await params;
    return handler({ user, supabase }, request, resolved);
  };
}

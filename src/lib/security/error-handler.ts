import { NextResponse } from "next/server";

/**
 * Safely format an error for API responses.
 * In production, hides internal error details to prevent information leakage.
 * In development, includes full details for debugging.
 */
export function formatApiError(error: unknown, fallbackMessage = "Internal server error"): {
  message: string;
  detail?: string;
} {
  const isDev = process.env.NODE_ENV === "development";

  if (error instanceof Error) {
    // Known error types with safe messages
    if (error.name === "PostgrestError") {
      return {
        message: "Database operation failed",
        ...(isDev ? { detail: error.message } : {}),
      };
    }

    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return { message: "External service unavailable" };
    }

    if (error.message.includes("JSON")) {
      return { message: "Invalid request format" };
    }

    // Generic: in production only return safe message
    return {
      message: isDev ? error.message : fallbackMessage,
      ...(isDev ? { detail: error.stack?.split("\n")[0] } : {}),
    };
  }

  if (typeof error === "string") {
    return { message: isDev ? error : fallbackMessage };
  }

  return { message: fallbackMessage };
}

/**
 * Create a safe error response that doesn't leak internal details in production.
 */
export function errorResponse(
  error: unknown,
  status: number = 500,
  fallbackMessage = "Internal server error"
): NextResponse {
  const formatted = formatApiError(error, fallbackMessage);
  const body: Record<string, unknown> = { error: formatted.message };
  if (formatted.detail) {
    body.detail = formatted.detail;
  }
  return NextResponse.json(body, { status });
}

/**
 * Format a Supabase error for safe API response.
 * Maps common Postgrest error codes to user-friendly messages.
 */
export function formatDatabaseError(error: { code?: string; message?: string }): {
  message: string;
  status: number;
} {
  const code = error.code;

  const ERROR_MAP: Record<string, { message: string; status: number }> = {
    "23505": { message: "A record with this data already exists", status: 409 },
    "23503": { message: "Referenced record not found", status: 400 },
    "42501": { message: "Permission denied", status: 403 },
    "PGRST116": { message: "Record not found", status: 404 },
    "PGRST204": { message: "No content", status: 204 },
  };

  if (code && ERROR_MAP[code]) {
    return ERROR_MAP[code];
  }

  return { message: "Database operation failed", status: 500 };
}

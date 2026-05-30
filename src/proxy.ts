import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { addSecurityHeaders } from "@/lib/security/headers";

const PUBLIC_PAGES = ["/auth/login", "/auth/callback"];
const PUBLIC_API_PATHS = ["/api/health", "/api/gateway/chat", "/api/v1/models", "/api/v1/chat/completions", "/api/v1/messages"];

function isPublicPath(path: string): boolean {
  if (PUBLIC_PAGES.includes(path)) return true;
  if (PUBLIC_API_PATHS.includes(path)) return true;
  return false;
}

function isApiPath(path: string): boolean {
  return path.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  let supabaseResponse = NextResponse.next({ request });
  supabaseResponse = applyCorsHeaders(request, supabaseResponse);

  if (request.method === "OPTIONS" && isApiPath(path)) {
    return applyCorsHeaders(request, addSecurityHeaders(new NextResponse(null, { status: 204 })));
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowedEmail = process.env.ALLOWED_EMAIL;

  if (!user && !isPublicPath(path)) {
    if (isApiPath(path)) {
      return addSecurityHeaders(applyCorsHeaders(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 })));
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return applyCorsHeaders(request, NextResponse.redirect(url));
  }

  if (user && allowedEmail && user.email !== allowedEmail) {
    await supabase.auth.signOut();
    if (isApiPath(path)) {
      return addSecurityHeaders(applyCorsHeaders(request, NextResponse.json({ error: "Forbidden" }, { status: 403 })));
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("error", "access_denied");
    return applyCorsHeaders(request, NextResponse.redirect(url));
  }

  if (user && isPublicPath(path) && user.email === allowedEmail) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return applyCorsHeaders(request, NextResponse.redirect(url));
  }

  // Apply security headers to all API responses
  if (isApiPath(path)) {
    addSecurityHeaders(supabaseResponse);
  }

  return supabaseResponse;
}

function applyCorsHeaders(request: NextRequest, response: NextResponse): NextResponse {
  if (!isApiPath(request.nextUrl.pathname)) {
    return response;
  }

  const origin = request.headers.get("origin");
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (origin) {
    const isDevelopment = process.env.NODE_ENV === "development";
    if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
      // Production: only allow explicitly listed origins
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Vary", "Origin");
    } else if (allowedOrigins.length === 0 && isDevelopment) {
      // Development with no configured origins: allow all
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Vary", "Origin");
    }
    // If allowedOrigins is empty and not development: no CORS header set (secure by default)
  }

  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

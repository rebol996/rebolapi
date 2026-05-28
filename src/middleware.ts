import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicPaths = ["/auth/login", "/auth/callback", "/api/gateway", "/api/health"];
  const isPublicPath = publicPaths.some((p) => path.startsWith(p));

  let supabaseResponse = NextResponse.next({ request });
  supabaseResponse = applyCorsHeaders(request, supabaseResponse);

  if (request.method === "OPTIONS" && path.startsWith("/api/")) {
    return applyCorsHeaders(request, new NextResponse(null, { status: 204 }));
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

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return applyCorsHeaders(request, NextResponse.redirect(url));
  }

  if (user && allowedEmail && user.email !== allowedEmail) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("error", "access_denied");
    return applyCorsHeaders(request, NextResponse.redirect(url));
  }

  if (user && isPublicPath && user.email === allowedEmail) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return applyCorsHeaders(request, NextResponse.redirect(url));
  }

  return supabaseResponse;
}

function applyCorsHeaders(request: NextRequest, response: NextResponse): NextResponse {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return response;
  }

  const origin = request.headers.get("origin");
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }

  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

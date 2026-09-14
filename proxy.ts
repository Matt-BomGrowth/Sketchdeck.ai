import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Route protection (Next.js proxy).
 * - DATA_MODE=live: every app route requires an authenticated Supabase session.
 * - DATA_MODE=demo: public unless DEMO_REQUIRE_AUTH=true.
 * Live customer data is never served through an unauthenticated route.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/api/health", "/api/cron"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const mode = (process.env.DATA_MODE ?? "demo").toLowerCase();
  const requireAuth = mode === "live" || process.env.DEMO_REQUIRE_AUTH === "true";
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!requireAuth || isPublic) return NextResponse.next();

  if (!url || !anon) {
    // Live mode without Supabase configured: fail closed.
    return new NextResponse("Authentication is required in live mode but Supabase is not configured.", { status: 503 });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

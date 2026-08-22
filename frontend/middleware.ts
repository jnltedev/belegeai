import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "belege_session";
const PROTECTED_PREFIXES = ["/documents", "/upload"];

export function middleware(request: NextRequest) {
  const isProtected = PROTECTED_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  // Presence-only check to short-circuit obvious unauthenticated requests.
  // The cookie is encrypted by @fastify/secure-session - full validation
  // happens server-side in the (app) layout via GET /api/auth/me.
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  if (!hasCookie) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/documents/:path*", "/upload/:path*"],
};

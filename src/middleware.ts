import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, isMockSession } from "@/lib/auth";

export function middleware(request: NextRequest) {
  const isAuthenticated = isMockSession(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  const isRoot = request.nextUrl.pathname === "/";
  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");

  if ((isRoot || isDashboardRoute) && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*"]
};

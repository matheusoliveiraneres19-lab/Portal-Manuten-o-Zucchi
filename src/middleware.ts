import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, getAuthSecret } from "@/lib/auth";
import { verifySession } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas de autenticação ficam liberadas (login/logout precisam ser acessíveis
  // sem sessão; caso contrário ninguém consegue entrar nem sair).
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  const secret = getAuthSecret();
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = secret ? await verifySession(token, secret) : null;

  if (!session) {
    if (isApi) {
      return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/api/:path*"]
};

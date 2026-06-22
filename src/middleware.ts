import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, FIRST_ACCESS_PATH, getAuthSecret } from "@/lib/auth";
import { verifySession } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas de autenticação ficam liberadas (login/logout/troca de senha precisam
  // ser acessíveis sem a checagem; cada rota valida a sessão internamente).
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

  // Primeiro acesso: sessão limitada (mustChange) NÃO pode acessar o portal.
  // Só é liberada a própria página de troca de senha; o resto vai para lá.
  if (session.mustChange) {
    if (isApi) {
      return NextResponse.json(
        { ok: false, message: "É necessário criar uma nova senha para continuar." },
        { status: 403 }
      );
    }
    if (pathname !== FIRST_ACCESS_PATH) {
      return NextResponse.redirect(new URL(FIRST_ACCESS_PATH, request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/primeiro-acesso", "/api/:path*"]
};

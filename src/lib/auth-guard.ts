/**
 * Defesa em profundidade para Server Components e rotas de API (runtime Node).
 *
 * O middleware é a barreira principal (já bloqueia /api/* sem sessão). Estas
 * funções re-validam a sessão dentro do handler. Para gating por papel, passe
 * a lista de roles para requireApiSession(["ADMIN", "GESTOR"]) — hoje as rotas
 * usam apenas a checagem de sessão (qualquer usuário autenticado).
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, getAuthSecret } from "@/lib/auth";
import { verifySession, type SessionPayload } from "@/lib/session";

export async function getSession(): Promise<SessionPayload | null> {
  const secret = getAuthSecret();
  if (!secret) {
    return null;
  }
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  return verifySession(token, secret);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("Não autenticado.");
  }
  return session;
}

/**
 * Trava por papel para handlers de rota de API (runtime Node).
 *
 * Os papéis (role) vêm do enum do banco (ADMIN, GESTOR, TECNICO, COMPRAS,
 * VISUALIZADOR) e são lidos do cookie de sessão da própria requisição.
 *
 * Retorna `NextResponse` (401 sem sessão / 403 sem papel) quando o acesso é
 * negado, ou `null` quando está liberado. Use no INÍCIO do handler:
 *
 *   const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
 *   if (denied) return denied;
 */
export async function requireRole(request: NextRequest, roles: string[]): Promise<NextResponse | null> {
  const secret = getAuthSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, message: "Configuração de segurança ausente (AUTH_SECRET)." },
      { status: 500 }
    );
  }
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = await verifySession(token, secret);
  if (!session) {
    return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  }
  if (roles.length > 0 && !roles.includes(session.role)) {
    return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
  }
  return null;
}

type ApiGuardResult =
  | { session: SessionPayload; error: null }
  | { session: null; error: NextResponse };

/**
 * Guard para handlers de rota de API. Retorna a sessão válida OU um NextResponse
 * de erro pronto para devolver (401 sem sessão, 403 sem papel).
 *
 * Uso:
 *   const { session, error } = await requireApiSession();
 *   if (error) return error;
 *
 * Para restringir por papel, passe os roles permitidos:
 *   const { session, error } = await requireApiSession(["ADMIN", "GESTOR"]);
 */
export async function requireApiSession(roles?: string[]): Promise<ApiGuardResult> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 })
    };
  }
  if (roles && roles.length > 0 && !roles.includes(session.role)) {
    return {
      session: null,
      error: NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 })
    };
  }
  return { session, error: null };
}

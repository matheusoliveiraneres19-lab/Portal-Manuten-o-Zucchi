/**
 * Defesa em profundidade para Server Components e rotas de API (runtime Node).
 *
 * ATENÇÃO (Fase 2): aplicar requireSession()/requireRole() dentro dos handlers
 * de /api/* (ex.: import, records) para autorização por papel. Hoje a barreira
 * principal é o middleware; estas funções ficam prontas mas ainda não aplicadas.
 */
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

// ATENÇÃO (Fase 2): os papéis (role) virão do enum do banco (ADMIN, GESTOR, ...).
export async function requireRole(...roles: string[]): Promise<SessionPayload> {
  const session = await requireSession();
  if (roles.length > 0 && !roles.includes(session.role)) {
    throw new Error("Acesso negado.");
  }
  return session;
}

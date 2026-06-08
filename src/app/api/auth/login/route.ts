import { NextResponse, type NextRequest } from "next/server";
import { UserStatus } from "@prisma/client";
import { AUTH_COOKIE_MAX_AGE, AUTH_COOKIE_NAME, AUTH_COOKIE_VALUE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_CREDENTIALS_MESSAGE = "Login ou senha inválidos. Verifique suas credenciais e tente novamente.";
const INACTIVE_USER_MESSAGE = "Usuário inativo. Entre em contato com o administrador.";
const GENERIC_ERROR_MESSAGE = "Não foi possível validar o acesso. Verifique suas credenciais ou tente novamente.";

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  TECNICO: "Técnico",
  COMPRAS: "Compras",
  VISUALIZADOR: "Visualizador"
};

type SessionUser = { login: string; name: string; role: string };

/**
 * Fallback temporário para ambiente de testes. Substituir por autenticação real em produção.
 *
 * Só é usado quando o banco (DATABASE_URL) não está disponível ou falha — por exemplo,
 * no deploy serverless da Netlify enquanto o SQLite local não é persistente. Mantém o
 * portal navegável em homologação. NÃO deve ser usado como autenticação definitiva.
 */
const TEST_FALLBACK_USERS: Record<string, { password: string; name: string; role: string }> = {
  admin: { password: "admin123", name: "Administrador", role: "ADMIN" },
  manutencao: { password: "admin123", name: "Manutenção Zucchi", role: "GESTOR" }
};

function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function buildSessionResponse(user: SessionUser): NextResponse {
  const response = NextResponse.json({ ok: true, user });
  response.cookies.set(AUTH_COOKIE_NAME, AUTH_COOKIE_VALUE, {
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax"
  });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { login?: unknown; password?: unknown } | null;
    const login = String(body?.login ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!login || !password) {
      return NextResponse.json({ ok: false, message: INVALID_CREDENTIALS_MESSAGE }, { status: 400 });
    }

    // 1) Autenticação via banco (Prisma) quando há DATABASE_URL e o banco responde.
    if (databaseConfigured()) {
      try {
        const user = await prisma.user.findUnique({
          where: { login },
          select: { id: true, login: true, name: true, passwordHash: true, role: true, status: true }
        });

        if (user && user.passwordHash) {
          if (user.status === UserStatus.INATIVO) {
            return NextResponse.json({ ok: false, message: INACTIVE_USER_MESSAGE }, { status: 403 });
          }
          // Autenticação temporária (senha em texto puro). Em produção, usar bcrypt
          // e sessão assinada/segura (cookie httpOnly/Secure).
          if (password !== user.passwordHash) {
            return NextResponse.json({ ok: false, message: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
          }
          // Atualiza o último acesso de forma best-effort (não bloqueia o login se falhar).
          try {
            await prisma.user.update({ where: { id: user.id }, data: { lastAccess: new Date() } });
          } catch {
            /* ignora falha de escrita do lastAccess */
          }
          return buildSessionResponse({
            login: user.login,
            name: user.name,
            role: roleLabels[user.role] ?? user.role
          });
        }
        // Usuário não encontrado no banco -> tenta o fallback de testes abaixo.
      } catch (error) {
        // Banco indisponível (ex.: SQLite local ausente no serverless da Netlify).
        // Log apenas no servidor, sem dados sensíveis (sem login/senha).
        console.error(
          "[auth] Banco de dados indisponível; usando fallback de testes.",
          error instanceof Error ? error.message : "erro desconhecido"
        );
      }
    }

    // 2) Fallback temporário para ambiente de testes. Substituir por autenticação real em produção.
    const fallback = TEST_FALLBACK_USERS[login];
    if (fallback && password === fallback.password) {
      return buildSessionResponse({
        login,
        name: fallback.name,
        role: roleLabels[fallback.role] ?? fallback.role
      });
    }

    return NextResponse.json({ ok: false, message: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  } catch (error) {
    // Garante que o front sempre receba JSON com mensagem amigável (evita tela branca/500 cru).
    console.error("[auth] Erro inesperado no login.", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }
}

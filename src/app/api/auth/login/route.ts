import { NextResponse, type NextRequest } from "next/server";
import { UserStatus } from "@prisma/client";
import { AUTH_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, getAuthSecret } from "@/lib/auth";
import { signSession } from "@/lib/session";
import { hashPassword, isBcryptHash, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_CREDENTIALS_MESSAGE = "Login ou senha inválidos. Verifique suas credenciais e tente novamente.";
const INACTIVE_USER_MESSAGE = "Usuário inativo. Entre em contato com o administrador.";
const GENERIC_ERROR_MESSAGE = "Não foi possível validar o acesso. Verifique suas credenciais ou tente novamente.";
const MISSING_SECRET_MESSAGE = "Configuração de segurança ausente (AUTH_SECRET). Contate o administrador.";

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  TECNICO: "Técnico",
  COMPRAS: "Compras",
  VISUALIZADOR: "Visualizador"
};

/**
 * Fallback temporário, restrito a desenvolvimento. Só roda quando
 * ALLOW_AUTH_FALLBACK === "true" E NODE_ENV !== "production". Em produção,
 * uma falha de banco NUNCA libera o fallback (retorna 503).
 */
const TEST_FALLBACK_USERS: Record<string, { password: string; name: string; role: string }> = {
  admin: { password: "admin123", name: "Administrador", role: "ADMIN" },
  manutencao: { password: "admin123", name: "Manutenção Zucchi", role: "GESTOR" }
};

function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function fallbackAllowed(): boolean {
  return process.env.ALLOW_AUTH_FALLBACK === "true" && process.env.NODE_ENV !== "production";
}

async function buildSessionResponse(
  secret: string,
  // role: papel "cru" do banco (ex.: ADMIN) — guardado no token assinado.
  session: { login: string; name: string; role: string },
  // displayRole: rótulo amigável devolvido ao front (ex.: Administrador).
  displayRole: string
): Promise<NextResponse> {
  const token = await signSession(
    { sub: session.login, name: session.name, role: session.role },
    secret,
    SESSION_MAX_AGE_SECONDS
  );

  const response = NextResponse.json({
    ok: true,
    user: { login: session.login, name: session.name, role: displayRole }
  });

  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });

  return response;
}

export async function POST(request: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) {
    console.error("[auth] AUTH_SECRET ausente ou com menos de 16 caracteres. Login bloqueado.");
    return NextResponse.json({ ok: false, message: MISSING_SECRET_MESSAGE }, { status: 500 });
  }

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
          // Confere a senha de forma explícita: bcrypt quando já é hash; comparação
          // direta quando ainda é texto puro legado (migrado logo abaixo).
          const storedIsBcrypt = isBcryptHash(user.passwordHash);
          const passwordOk = storedIsBcrypt
            ? await verifyPassword(password, user.passwordHash)
            : password === user.passwordHash;
          if (!passwordOk) {
            return NextResponse.json({ ok: false, message: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
          }
          // Migração transparente: se a senha ainda estava em texto puro, re-hasheia
          // com bcrypt no primeiro login bem-sucedido (best-effort, não bloqueia).
          const needsRehash = !storedIsBcrypt;
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                lastAccess: new Date(),
                ...(needsRehash ? { passwordHash: await hashPassword(password) } : {})
              }
            });
          } catch {
            /* ignora falha de escrita (lastAccess/rehash); não bloqueia o login */
          }
          return await buildSessionResponse(
            secret,
            { login: user.login, name: user.name, role: user.role },
            roleLabels[user.role] ?? user.role
          );
        }
        // Usuário não encontrado no banco -> tenta o fallback (apenas se permitido) abaixo.
      } catch (error) {
        // Banco indisponível. Log sem dados sensíveis (sem login/senha).
        console.error(
          "[auth] Banco de dados indisponível.",
          error instanceof Error ? error.message : "erro desconhecido"
        );
        // Em produção, falha de banco NUNCA libera fallback: retorna 503 (erro).
        if (process.env.NODE_ENV === "production") {
          return NextResponse.json({ ok: false, message: GENERIC_ERROR_MESSAGE }, { status: 503 });
        }
      }
    }

    // 2) Fallback temporário — somente em desenvolvimento e com flag explícita.
    if (fallbackAllowed()) {
      const fallback = TEST_FALLBACK_USERS[login];
      if (fallback && password === fallback.password) {
        return await buildSessionResponse(
          secret,
          { login, name: fallback.name, role: fallback.role },
          roleLabels[fallback.role] ?? fallback.role
        );
      }
    }

    return NextResponse.json({ ok: false, message: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  } catch (error) {
    // Garante que o front sempre receba JSON com mensagem amigável (evita tela branca/500 cru).
    console.error("[auth] Erro inesperado no login.", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }
}

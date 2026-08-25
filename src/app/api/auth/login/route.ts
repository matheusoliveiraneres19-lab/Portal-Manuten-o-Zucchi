import { NextResponse, type NextRequest } from "next/server";
import { UserStatus } from "@prisma/client";
import { AUTH_COOKIE_NAME, FIRST_ACCESS_MAX_AGE_SECONDS, SESSION_MAX_AGE_SECONDS, getAuthSecret } from "@/lib/auth";
import { signSession } from "@/lib/session";
import { hashPassword, isBcryptHash, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/services/audit.service";
import { getClientIp } from "@/lib/request-ip";
import { checkRateLimit, registerFailure, resetRateLimit } from "@/lib/rate-limit";
import { AUDIT_ACTIONS, AUDIT_MODULES } from "@/types/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_CREDENTIALS_MESSAGE = "Login ou senha inválidos. Verifique suas credenciais e tente novamente.";
const INACTIVE_USER_MESSAGE = "Usuário inativo. Entre em contato com o administrador.";
const GENERIC_ERROR_MESSAGE = "Não foi possível validar o acesso. Verifique suas credenciais ou tente novamente.";
const MISSING_SECRET_MESSAGE = "Configuração de segurança ausente (AUTH_SECRET). Contate o administrador.";
const EXPIRED_TEMP_PASSWORD_MESSAGE =
  "A senha temporária expirou. Solicite uma nova ao administrador para acessar o portal.";

/**
 * Limites de tentativas FALHAS por janela deslizante (ver src/lib/rate-limit.ts
 * para a limitação de contador em memória).
 *
 * Por conta: 5 em 15 min — folga para erro de digitação, longe de força bruta.
 * Por IP: 30 em 15 min, porque a Zucchi sai por um único IP de NAT e vários
 * usuários errando a senha no mesmo intervalo é normal; o teto só corta a
 * varredura de logins em sequência.
 */
const LOGIN_RULE_PER_ACCOUNT = { limit: 5, windowMs: 15 * 60 * 1000 };
const LOGIN_RULE_PER_IP = { limit: 30, windowMs: 15 * 60 * 1000 };

function tooManyAttemptsMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Muitas tentativas de acesso. Aguarde ${minutes} minuto(s) e tente novamente.`;
}

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
  displayRole: string,
  // Primeiro acesso: sessão LIMITADA (só troca de senha), com TTL curto.
  options: { mustChange?: boolean } = {}
): Promise<NextResponse> {
  const mustChange = options.mustChange === true;
  const maxAge = mustChange ? FIRST_ACCESS_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;

  const token = await signSession(
    { sub: session.login, name: session.name, role: session.role, mustChange },
    secret,
    maxAge
  );

  const user = { login: session.login, name: session.name, role: displayRole };
  const response = NextResponse.json(
    mustChange
      ? { ok: true, mustChangePassword: true, user, message: "É necessário criar uma nova senha para continuar." }
      : { ok: true, user }
  );

  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge
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

    // Freio de força bruta ANTES de validar a senha: uma chave já bloqueada não
    // deve pagar o custo do bcrypt (senão o próprio limitador vira alavanca de
    // CPU). Duas chaves: o login barra o ataque a UMA conta; o IP barra a
    // varredura de vários logins da mesma origem.
    const clientIp = getClientIp(request);
    const loginKey = `login:${login}`;
    const ipKey = `ip:${clientIp ?? "desconhecido"}`;
    for (const [key, rule] of [
      [loginKey, LOGIN_RULE_PER_ACCOUNT],
      [ipKey, LOGIN_RULE_PER_IP]
    ] as const) {
      const state = checkRateLimit(key, rule);
      if (!state.allowed) {
        console.warn("[auth] Login bloqueado por excesso de tentativas.", { key, retryAfterSeconds: state.retryAfterSeconds });
        return NextResponse.json(
          { ok: false, message: tooManyAttemptsMessage(state.retryAfterSeconds) },
          { status: 429, headers: { "Retry-After": String(state.retryAfterSeconds) } }
        );
      }
    }

    /** Contabiliza a falha nas duas chaves e devolve a resposta de credencial inválida. */
    const invalidCredentials = () => {
      registerFailure(loginKey, LOGIN_RULE_PER_ACCOUNT);
      registerFailure(ipKey, LOGIN_RULE_PER_IP);
      return NextResponse.json({ ok: false, message: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
    };

    // 1) Autenticação via banco (Prisma) quando há DATABASE_URL e o banco responde.
    if (databaseConfigured()) {
      try {
        const user = await prisma.user.findUnique({
          where: { login },
          select: {
            id: true,
            login: true,
            name: true,
            passwordHash: true,
            role: true,
            status: true,
            mustChangePassword: true,
            temporaryPasswordExpiresAt: true
          }
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
            return invalidCredentials();
          }
          // Credencial correta: zera o contador das duas chaves.
          resetRateLimit(loginKey);
          resetRateLimit(ipKey);
          // Primeiro acesso: senha correta, mas precisa redefinir antes de entrar.
          const mustChange = user.mustChangePassword === true;

          // Senha TEMPORÁRIA vencida não entra. O prazo (TEMP_PASSWORD_TTL_DAYS em
          // users.service) só faz sentido enquanto a senha ainda é temporária: a troca
          // zera `temporaryPasswordExpiresAt` junto com `mustChangePassword`, então
          // gatilhamos pelos dois para nunca barrar quem já definiu a senha própria.
          if (mustChange && user.temporaryPasswordExpiresAt && user.temporaryPasswordExpiresAt < new Date()) {
            console.warn("[auth] Login bloqueado: senha temporária expirada.", { userId: user.id });
            return NextResponse.json({ ok: false, message: EXPIRED_TEMP_PASSWORD_MESSAGE }, { status: 403 });
          }

          // Migração transparente: se a senha ainda estava em texto puro, re-hasheia
          // com bcrypt no primeiro login bem-sucedido (best-effort, não bloqueia).
          const needsRehash = !storedIsBcrypt;
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                lastAccess: new Date(),
                // lastLoginAt só conta como login efetivo quando NÃO é troca obrigatória.
                ...(mustChange ? {} : { lastLoginAt: new Date() }),
                ...(needsRehash ? { passwordHash: await hashPassword(password) } : {})
              }
            });
          } catch {
            /* ignora falha de escrita (lastAccess/rehash); não bloqueia o login */
          }
          await createAuditLog({
            action: AUDIT_ACTIONS.LOGIN,
            module: AUDIT_MODULES.AUTENTICACAO,
            userId: user.id,
            userName: user.name,
            entityId: user.id,
            entityName: user.login,
            ipAddress: getClientIp(request),
            details: { role: user.role, mustChangePassword: mustChange }
          });
          return await buildSessionResponse(
            secret,
            { login: user.login, name: user.name, role: user.role },
            roleLabels[user.role] ?? user.role,
            { mustChange }
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
        resetRateLimit(loginKey);
        resetRateLimit(ipKey);
        return await buildSessionResponse(
          secret,
          { login, name: fallback.name, role: fallback.role },
          roleLabels[fallback.role] ?? fallback.role
        );
      }
    }

    // Login inexistente (ou fallback recusado): conta como falha, senão a
    // varredura de logins sairia de graça.
    return invalidCredentials();
  } catch (error) {
    // Garante que o front sempre receba JSON com mensagem amigável (evita tela branca/500 cru).
    console.error("[auth] Erro inesperado no login.", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }
}

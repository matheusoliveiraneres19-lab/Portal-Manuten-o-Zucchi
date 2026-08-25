import { NextResponse, type NextRequest } from "next/server";
import { UserStatus } from "@prisma/client";
import { AUTH_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, getAuthSecret } from "@/lib/auth";
import { signSession, verifySession } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/services/audit.service";
import { getClientIp } from "@/lib/request-ip";
import { AUDIT_ACTIONS, AUDIT_MODULES } from "@/types/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  TECNICO: "Técnico",
  COMPRAS: "Compras",
  VISUALIZADOR: "Visualizador"
};

const GENERIC_ERROR = "Não foi possível alterar a senha. Tente novamente.";

/** Regras mínimas da nova senha (espelhadas no cliente; o servidor é a autoridade). */
function validateNewPassword(password: string, confirm: string): string | null {
  if (!password || !confirm) {
    return "Informe e confirme a nova senha.";
  }
  if (password.length < 8) {
    return "A senha deve ter no mínimo 8 caracteres.";
  }
  if (!/[A-Za-z]/.test(password)) {
    return "A senha deve conter pelo menos 1 letra.";
  }
  if (!/\d/.test(password)) {
    return "A senha deve conter pelo menos 1 número.";
  }
  if (password !== confirm) {
    return "As senhas não conferem.";
  }
  return null;
}

export async function POST(request: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, message: GENERIC_ERROR }, { status: 500 });
  }

  // Esta rota está FORA da checagem do middleware (ver o bypass de /api/auth/),
  // então a validação da sessão acontece aqui e é a única barreira.
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = await verifySession(token, secret);
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  // SOMENTE a sessão limitada de primeiro acesso troca a senha por aqui.
  //
  // O motivo é reduzir superfície: o único cliente desta rota é o
  // FirstAccessForm, e não existe tela de troca voluntária no portal (o reset é
  // feito pelo ADMIN, que gera nova senha temporária). Aceitar sessão normal
  // deixava uma sessão esquecida aberta trocar a senha sem informar a atual.
  //
  // Se um dia existir "alterar minha senha" para o usuário logado, o caminho é
  // liberar a sessão normal AQUI exigindo também a senha atual no corpo — não
  // remover esta checagem.
  if (session.mustChange !== true) {
    return NextResponse.json(
      { ok: false, message: "Troca de senha indisponível. Solicite um reset ao administrador." },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | { password?: unknown; confirmPassword?: unknown }
      | null;
    const password = String(body?.password ?? "");
    const confirmPassword = String(body?.confirmPassword ?? "");

    const validationError = validateNewPassword(password, confirmPassword);
    if (validationError) {
      return NextResponse.json({ ok: false, message: validationError }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { login: session.sub },
      select: { id: true, login: true, name: true, role: true, status: true, passwordHash: true }
    });

    if (!user) {
      return NextResponse.json({ ok: false, message: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }
    if (user.status === UserStatus.INATIVO) {
      return NextResponse.json({ ok: false, message: "Usuário inativo. Contate o administrador." }, { status: 403 });
    }

    // Não pode repetir a senha temporária/atual.
    if (user.passwordHash && (await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json(
        { ok: false, message: "A nova senha não pode ser igual à senha temporária." },
        { status: 400 }
      );
    }

    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        mustChangePassword: false,
        passwordChangedAt: now,
        lastLoginAt: now,
        lastAccess: now,
        temporaryPasswordExpiresAt: null
      }
    });

    await createAuditLog({
      action: AUDIT_ACTIONS.TROCA_SENHA,
      module: AUDIT_MODULES.AUTENTICACAO,
      userId: user.id,
      userName: user.name,
      entityId: user.id,
      entityName: user.login,
      ipAddress: getClientIp(request)
    });

    // Emite uma sessão NORMAL (sem mustChange) — o usuário entra no portal.
    const newToken = await signSession(
      { sub: user.login, name: user.name, role: user.role },
      secret,
      SESSION_MAX_AGE_SECONDS
    );

    const response = NextResponse.json({
      ok: true,
      message: "Senha alterada com sucesso.",
      user: { login: user.login, name: user.name, role: roleLabels[user.role] ?? user.role }
    });
    response.cookies.set(AUTH_COOKIE_NAME, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS
    });
    return response;
  } catch (error) {
    // Nunca logar a senha; mensagem genérica para o usuário.
    console.error("[auth] Erro ao alterar senha.", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: GENERIC_ERROR }, { status: 500 });
  }
}

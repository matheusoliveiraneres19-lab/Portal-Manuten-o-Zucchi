import { NextResponse, type NextRequest } from "next/server";
import { UserStatus } from "@prisma/client";
import { AUTH_COOKIE_MAX_AGE, AUTH_COOKIE_NAME, AUTH_COOKIE_VALUE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const INVALID_CREDENTIALS_MESSAGE = "Login ou senha inválidos. Verifique suas credenciais e tente novamente.";
const INACTIVE_USER_MESSAGE = "Usuário inativo. Entre em contato com o administrador.";

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  TECNICO: "Técnico",
  COMPRAS: "Compras",
  VISUALIZADOR: "Visualizador"
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { login?: unknown; password?: unknown } | null;
  const login = String(body?.login ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!login || !password) {
    return NextResponse.json({ ok: false, message: INVALID_CREDENTIALS_MESSAGE }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { login },
    select: {
      id: true,
      login: true,
      name: true,
      passwordHash: true,
      role: true,
      status: true
    }
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json({ ok: false, message: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  if (user.status === UserStatus.INATIVO) {
    return NextResponse.json({ ok: false, message: INACTIVE_USER_MESSAGE }, { status: 403 });
  }

  // Autenticação temporária para desenvolvimento local.
  // Em produção, usar bcrypt, sessão segura e cookie httpOnly/Secure assinado.
  if (password !== user.passwordHash) {
    return NextResponse.json({ ok: false, message: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastAccess: new Date() }
  });

  const response = NextResponse.json({
    ok: true,
    user: {
      login: user.login,
      name: user.name,
      role: roleLabels[user.role] ?? user.role
    }
  });

  response.cookies.set(AUTH_COOKIE_NAME, AUTH_COOKIE_VALUE, {
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax"
  });

  return response;
}

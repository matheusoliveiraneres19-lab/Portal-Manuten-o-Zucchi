import { NextResponse, type NextRequest } from "next/server";
import { UserStatus } from "@prisma/client";
import { requireApiSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { resetUserPassword, updateUser } from "@/services/users.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Atualiza um usuário (somente ADMIN):
 * - `resetPassword`: define nova senha temporária + força troca no próximo acesso;
 * - perfil/flags: name, email, role, status, mustChangePassword.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireApiSession(["ADMIN"]);
  if (error) return error;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Requisição inválida." }, { status: 400 });
    }

    // Reset de senha tem caminho próprio (não mistura com edição de perfil).
    if (typeof body.resetPassword === "string") {
      const result = await resetUserPassword(params.id, body.resetPassword);
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message, field: result.field }, { status: result.status });
      }
      return NextResponse.json({ ok: true, user: result.data });
    }

    const status =
      body.status && (Object.values(UserStatus) as string[]).includes(String(body.status))
        ? (String(body.status) as UserStatus)
        : undefined;
    const role = typeof body.role === "string" ? body.role : undefined;

    // Proteções: o ADMIN não pode se trancar do lado de fora.
    if (status === UserStatus.INATIVO || (role && role !== "ADMIN")) {
      const target = await prisma.user.findUnique({ where: { id: params.id }, select: { login: true } });
      if (target && target.login === session.sub) {
        const message =
          status === UserStatus.INATIVO
            ? "Você não pode inativar a própria conta."
            : "Você não pode remover seu próprio papel de Administrador.";
        return NextResponse.json({ ok: false, message }, { status: 400 });
      }
    }

    const result = await updateUser(params.id, {
      name: typeof body.name === "string" ? body.name : undefined,
      email: typeof body.email === "string" ? body.email : undefined,
      role,
      status,
      mustChangePassword: typeof body.mustChangePassword === "boolean" ? body.mustChangePassword : undefined
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message, field: result.field }, { status: result.status });
    }
    return NextResponse.json({ ok: true, user: result.data });
  } catch (err) {
    console.error("[users] Falha ao atualizar usuário.", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, message: "Falha ao atualizar usuário." }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { UserStatus } from "@prisma/client";
import { requireApiSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { updateUserFlags } from "@/services/users.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Atualiza flags do usuário (forçar troca de senha / ativar-inativar). Somente ADMIN. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireApiSession(["ADMIN"]);
  if (error) return error;

  try {
    const body = (await request.json().catch(() => null)) as
      | { mustChangePassword?: unknown; status?: unknown }
      | null;

    const status =
      body?.status && (Object.values(UserStatus) as string[]).includes(String(body.status))
        ? (String(body.status) as UserStatus)
        : undefined;
    const mustChangePassword =
      typeof body?.mustChangePassword === "boolean" ? body.mustChangePassword : undefined;

    // Proteção: o ADMIN não pode inativar a própria conta (evita se trancar do lado de fora).
    if (status === UserStatus.INATIVO) {
      const target = await prisma.user.findUnique({ where: { id: params.id }, select: { login: true } });
      if (target && target.login === session.sub) {
        return NextResponse.json({ ok: false, message: "Você não pode inativar a própria conta." }, { status: 400 });
      }
    }

    const result = await updateUserFlags(params.id, { mustChangePassword, status });
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
    }
    return NextResponse.json({ ok: true, user: result.data });
  } catch (err) {
    console.error("[users] Falha ao atualizar usuário.", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, message: "Falha ao atualizar usuário." }, { status: 500 });
  }
}

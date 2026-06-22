import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { createUser, listUsers } from "@/services/users.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista usuários (somente ADMIN). */
export async function GET() {
  const { error } = await requireApiSession(["ADMIN"]);
  if (error) return error;

  try {
    const users = await listUsers();
    return NextResponse.json({ ok: true, users });
  } catch (err) {
    console.error("[users] Falha ao listar usuários.", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, message: "Falha ao listar usuários." }, { status: 500 });
  }
}

/** Cria um usuário com senha temporária (troca obrigatória no 1º acesso). Somente ADMIN. */
export async function POST(request: NextRequest) {
  const { error } = await requireApiSession(["ADMIN"]);
  if (error) return error;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const result = await createUser({
      name: String(body?.name ?? ""),
      login: String(body?.login ?? ""),
      email: body?.email ? String(body.email) : undefined,
      role: String(body?.role ?? ""),
      temporaryPassword: String(body?.temporaryPassword ?? ""),
      requirePasswordChange: body?.requirePasswordChange !== false
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message, field: result.field }, { status: result.status });
    }
    return NextResponse.json({ ok: true, user: result.data }, { status: 201 });
  } catch (err) {
    console.error("[users] Falha ao criar usuário.", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, message: "Falha ao criar usuário." }, { status: 500 });
  }
}

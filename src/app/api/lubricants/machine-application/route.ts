import { NextResponse, type NextRequest } from "next/server";
import {
  deleteLubricantMachineApplication,
  saveLubricantMachineApplication
} from "@/services/lubricants.service";
import { requireRole } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const body = await request.json();
    const code = typeof body.code === "string" ? body.code : "";
    const equipmentName = typeof body.equipmentName === "string" ? body.equipmentName : "";

    if (!code || !equipmentName.trim()) {
      return NextResponse.json({ error: "Código do lubrificante e nome do equipamento são obrigatórios." }, { status: 400 });
    }

    const created = await saveLubricantMachineApplication({
      code,
      equipmentName,
      equipmentCode: body.equipmentCode ?? null,
      applicationPoint: body.applicationPoint ?? null,
      recommendation: body.recommendation ?? null
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    console.error("Falha ao salvar aplicação de lubrificante.", error);
    const message = error instanceof Error ? error.message : "Falha ao salvar aplicação.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Parâmetro 'id' é obrigatório." }, { status: 400 });
  }

  try {
    await deleteLubricantMachineApplication(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Falha ao remover aplicação de lubrificante.", error);
    return NextResponse.json({ error: "Falha ao remover aplicação." }, { status: 500 });
  }
}

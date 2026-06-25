import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { deleteAttachmentRecord, getAttachmentRecord, resolveProcedureId } from "@/services/procedures.service";
import { PROCEDURE_ATTACHMENTS_BUCKET, removeObject, storageConfigured } from "@/lib/supabase-storage";
import { PROCEDURE_WRITE_ROLES } from "@/constants/procedure-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { idOrSlug: string; attId: string } };

// DELETE: remove o material de apoio (objeto do Storage + metadado) — ADMIN/GESTOR.
export async function DELETE(request: NextRequest, { params }: Params) {
  const denied = await requireRole(request, PROCEDURE_WRITE_ROLES);
  if (denied) return denied;

  const procedureId = await resolveProcedureId(params.idOrSlug);
  if (!procedureId) return NextResponse.json({ ok: false, message: "Procedimento não encontrado." }, { status: 404 });

  const record = await getAttachmentRecord(params.attId);
  if (!record || record.procedureId !== procedureId) {
    return NextResponse.json({ ok: false, message: "Material não encontrado." }, { status: 404 });
  }

  try {
    // Só uploads têm objeto no Storage (links externos não).
    if (record.fileType !== "link" && storageConfigured()) {
      await removeObject(record.fileUrl, PROCEDURE_ATTACHMENTS_BUCKET).catch((error) => {
        console.error("[procedures/attachments] Falha ao remover objeto.", error instanceof Error ? error.message : error);
      });
    }
    await deleteAttachmentRecord(params.attId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[procedures/attachments] Falha ao remover.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível remover o material." }, { status: 500 });
  }
}

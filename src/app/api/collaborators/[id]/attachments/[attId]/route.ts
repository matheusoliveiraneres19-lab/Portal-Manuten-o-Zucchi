import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { deleteAttachmentRecord, getAttachmentRecord } from "@/services/collaborator-assets.service";
import { createSignedUrl, removeObject, storageConfigured } from "@/lib/supabase-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Download e exclusão de anexo → ADMIN/GESTOR (dados pessoais).

// GET: devolve uma URL assinada de curta duração para baixar o PDF.
export async function GET(request: NextRequest, { params }: { params: { id: string; attId: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  if (!storageConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Armazenamento de anexos não configurado." },
      { status: 503 }
    );
  }

  try {
    const record = await getAttachmentRecord(params.attId);
    if (!record || record.collaboratorId !== params.id) {
      return NextResponse.json({ ok: false, message: "Anexo não encontrado." }, { status: 404 });
    }
    const url = await createSignedUrl(record.storagePath, 60);
    return NextResponse.json({ ok: true, url, fileName: record.fileName });
  } catch (error) {
    console.error("[collaborators/attachments] Falha ao gerar URL.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível gerar o link do anexo." }, { status: 500 });
  }
}

// DELETE: remove o objeto do Storage e o metadado.
export async function DELETE(request: NextRequest, { params }: { params: { id: string; attId: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const record = await getAttachmentRecord(params.attId);
    if (!record || record.collaboratorId !== params.id) {
      return NextResponse.json({ ok: false, message: "Anexo não encontrado." }, { status: 404 });
    }
    if (storageConfigured()) {
      await removeObject(record.storagePath).catch((error) => {
        // Não bloqueia a remoção do metadado se o objeto já não existir.
        console.error("[collaborators/attachments] Falha ao remover objeto do Storage.", error instanceof Error ? error.message : error);
      });
    }
    await deleteAttachmentRecord(params.attId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[collaborators/attachments] Falha ao remover anexo.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível remover o anexo." }, { status: 500 });
  }
}

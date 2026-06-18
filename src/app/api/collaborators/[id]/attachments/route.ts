import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import {
  coerceAttachmentKind,
  createAttachmentRecord,
  listAttachments
} from "@/services/collaborator-assets.service";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  removeObject,
  storageConfigured,
  uploadAttachment
} from "@/lib/supabase-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Anexos lidam com dados pessoais → ADMIN/GESTOR em TODOS os métodos.

// GET: lista os anexos (metadados) do colaborador.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  try {
    const attachments = await listAttachments(params.id);
    return NextResponse.json({ ok: true, attachments });
  } catch (error) {
    console.error("[collaborators/attachments] Falha ao listar anexos.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar os anexos." }, { status: 500 });
  }
}

// POST: upload de anexo (PDF, ≤ 10 MB) recebido pelo servidor.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  if (!storageConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Armazenamento de anexos não configurado. Contate o administrador." },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = coerceAttachmentKind(formData.get("kind"));

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "Arquivo é obrigatório (campo 'file')." }, { status: 400 });
    }
    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_CONTENT_TYPES.includes(contentType as (typeof ALLOWED_CONTENT_TYPES)[number]) || !/\.pdf$/i.test(file.name)) {
      return NextResponse.json({ ok: false, message: "Envie um arquivo PDF." }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ ok: false, message: "Arquivo vazio." }, { status: 400 });
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ ok: false, message: "Arquivo excede o limite de 10 MB." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `${params.id}/${kind}/${randomUUID()}.pdf`;

    await uploadAttachment(storagePath, buffer, "application/pdf");

    try {
      const attachment = await createAttachmentRecord({
        collaboratorId: params.id,
        kind,
        fileName: file.name,
        storagePath,
        contentType: "application/pdf",
        sizeBytes: file.size
      });
      return NextResponse.json({ ok: true, attachment }, { status: 201 });
    } catch (dbError) {
      // Evita objeto órfão no Storage se a gravação do metadado falhar.
      await removeObject(storagePath).catch(() => {});
      throw dbError;
    }
  } catch (error) {
    console.error("[collaborators/attachments] Falha no upload.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível enviar o anexo." }, { status: 500 });
  }
}

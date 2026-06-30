import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession, requireRole } from "@/lib/auth-guard";
import {
  ProcedureValidationError,
  createAttachmentRecord,
  createLinkAttachment,
  getProcedureAttachments,
  resolveProcedureId
} from "@/services/procedures.service";
import {
  MAX_PROCEDURE_ATTACHMENT_BYTES,
  PROCEDURE_ATTACHMENTS_BUCKET,
  PROCEDURE_UPLOAD_CONTENT_TYPES,
  objectExists,
  removeObject,
  storageConfigured,
  uploadAttachment
} from "@/lib/supabase-storage";
import { PROCEDURE_WRITE_ROLES } from "@/constants/procedure-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { idOrSlug: string } };

// GET: lista materiais de apoio (qualquer usuário logado).
export async function GET(_request: NextRequest, { params }: Params) {
  const { error } = await requireApiSession();
  if (error) return error;

  const procedureId = await resolveProcedureId(params.idOrSlug);
  if (!procedureId) return NextResponse.json({ ok: false, message: "Procedimento não encontrado." }, { status: 404 });

  const attachments = await getProcedureAttachments(procedureId);
  return NextResponse.json({ ok: true, attachments });
}

// POST: upload de arquivo (multipart) OU link externo (JSON) — ADMIN/GESTOR.
export async function POST(request: NextRequest, { params }: Params) {
  const denied = await requireRole(request, PROCEDURE_WRITE_ROLES);
  if (denied) return denied;

  const procedureId = await resolveProcedureId(params.idOrSlug);
  if (!procedureId) return NextResponse.json({ ok: false, message: "Procedimento não encontrado." }, { status: 404 });

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) ?? {};

      // ---- Registro de vídeo já enviado direto ao Storage (videoaula > 4 MB) ----
      if (body.storagePath) {
        const storagePath = String(body.storagePath);
        // Trava: o objeto precisa pertencer a ESTE procedimento (prefixo = procedureId).
        if (!storagePath.startsWith(`${procedureId}/`)) {
          return NextResponse.json({ ok: false, message: "Caminho de vídeo inválido." }, { status: 400 });
        }
        if (!(await objectExists(storagePath, PROCEDURE_ATTACHMENTS_BUCKET))) {
          return NextResponse.json({ ok: false, message: "Upload do vídeo não encontrado." }, { status: 400 });
        }
        const attachment = await createAttachmentRecord({
          procedureId,
          fileName: String(body.fileName ?? "videoaula.mp4"),
          fileType: "video/mp4",
          fileUrl: storagePath,
          fileSize: typeof body.fileSize === "number" ? body.fileSize : null,
          description: body.description ?? null
        });
        return NextResponse.json({ ok: true, attachment }, { status: 201 });
      }

      // ---- Link externo (vídeo/documento) ----
      const attachment = await createLinkAttachment({
        procedureId,
        url: String(body.url ?? ""),
        fileName: body.fileName ?? null,
        description: body.description ?? null
      });
      return NextResponse.json({ ok: true, attachment }, { status: 201 });
    }

    // ---- Upload de arquivo ----
    if (!storageConfigured()) {
      return NextResponse.json(
        { ok: false, message: "Armazenamento de anexos não configurado. Contate o administrador." },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const description = formData.get("description");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "Arquivo é obrigatório (campo 'file')." }, { status: 400 });
    }
    const mime = file.type || "application/octet-stream";
    const ext = PROCEDURE_UPLOAD_CONTENT_TYPES[mime];
    if (!ext) {
      return NextResponse.json(
        { ok: false, message: "Tipo não suportado. Use PDF, PNG, JPG, WebP ou MP4 (vídeos grandes: use link)." },
        { status: 400 }
      );
    }
    if (file.size <= 0) {
      return NextResponse.json({ ok: false, message: "Arquivo vazio." }, { status: 400 });
    }
    if (file.size > MAX_PROCEDURE_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { ok: false, message: "Arquivo excede 4 MB. Para vídeos, use um link externo." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `${procedureId}/${randomUUID()}${ext}`;
    await uploadAttachment(storagePath, buffer, mime, PROCEDURE_ATTACHMENTS_BUCKET);

    try {
      const attachment = await createAttachmentRecord({
        procedureId,
        fileName: file.name,
        fileType: mime,
        fileUrl: storagePath,
        fileSize: file.size,
        description: typeof description === "string" ? description : null
      });
      return NextResponse.json({ ok: true, attachment }, { status: 201 });
    } catch (dbError) {
      await removeObject(storagePath, PROCEDURE_ATTACHMENTS_BUCKET).catch(() => {});
      throw dbError;
    }
  } catch (error) {
    if (error instanceof ProcedureValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("[procedures/attachments] Falha no anexo.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível adicionar o material de apoio." }, { status: 500 });
  }
}

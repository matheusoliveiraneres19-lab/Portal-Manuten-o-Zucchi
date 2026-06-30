import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { resolveProcedureId } from "@/services/procedures.service";
import {
  MAX_PROCEDURE_VIDEO_BYTES,
  PROCEDURE_ATTACHMENTS_BUCKET,
  PROCEDURE_VIDEO_CONTENT_TYPES,
  createSignedUploadUrl,
  getStoragePublicApiKey,
  storageConfigured
} from "@/lib/supabase-storage";
import { PROCEDURE_WRITE_ROLES } from "@/constants/procedure-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { idOrSlug: string } };

/**
 * POST: gera uma URL ASSINADA para o navegador enviar a videoaula (MP4) DIRETO ao
 * Supabase Storage, sem passar pela função serverless (contorna o limite de ~4,5 MB da
 * Vercel). Só ADMIN/GESTOR. O registro do anexo é feito depois via POST /attachments.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const denied = await requireRole(request, PROCEDURE_WRITE_ROLES);
  if (denied) return denied;

  const procedureId = await resolveProcedureId(params.idOrSlug);
  if (!procedureId) return NextResponse.json({ ok: false, message: "Procedimento não encontrado." }, { status: 404 });

  if (!storageConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Armazenamento de vídeos não configurado. Contate o administrador." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { fileName?: string; contentType?: string; fileSize?: number }
    | null;

  const contentType = String(body?.contentType ?? "");
  const ext = PROCEDURE_VIDEO_CONTENT_TYPES[contentType];
  if (!ext) {
    return NextResponse.json(
      { ok: false, message: "Formato não suportado. Envie um vídeo MP4 (ou use um link do YouTube/Drive)." },
      { status: 400 }
    );
  }

  const fileSize = Number(body?.fileSize ?? 0);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ ok: false, message: "Arquivo de vídeo inválido." }, { status: 400 });
  }
  if (fileSize > MAX_PROCEDURE_VIDEO_BYTES) {
    const maxMb = Math.round(MAX_PROCEDURE_VIDEO_BYTES / (1024 * 1024));
    return NextResponse.json(
      { ok: false, message: `Vídeo excede ${maxMb} MB. Compacte o arquivo ou use um link (YouTube/Drive).` },
      { status: 400 }
    );
  }

  const storagePath = `${procedureId}/${randomUUID()}${ext}`;

  try {
    const { uploadUrl, token } = await createSignedUploadUrl(storagePath, PROCEDURE_ATTACHMENTS_BUCKET);
    return NextResponse.json(
      {
        ok: true,
        uploadUrl,
        token,
        storagePath,
        contentType,
        bucket: PROCEDURE_ATTACHMENTS_BUCKET,
        supabaseUrl: process.env.SUPABASE_URL,
        apiKey: getStoragePublicApiKey()
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[procedures/upload-url] Falha ao gerar URL.", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, message: "Não foi possível iniciar o upload do vídeo." }, { status: 500 });
  }
}

/**
 * Justificativas de baixa disponibilidade (PC-Factory).
 *
 *   GET  ?start=&end=              justificativas daquela janela exata
 *   GET  ?machine=&history=1       histórico da máquina (todas as janelas)
 *   POST                           cria/atualiza a justificativa de (máquina + período)
 *
 * Leitura: qualquer usuário autenticado. Escrita: só os papéis de
 * AVAILABILITY_NOTE_WRITE_ROLES (ADMIN/GESTOR) — os mesmos que a Central de
 * Procedimentos já usa. Nenhum papel novo foi criado.
 *
 * Esta rota NÃO calcula disponibilidade: só grava e lê texto gerencial.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSession, requireApiSession, requireRole } from "@/lib/auth-guard";
import { createAuditLog } from "@/services/audit.service";
import { getClientIp } from "@/lib/request-ip";
import { AUDIT_ACTIONS, AUDIT_MODULES } from "@/types/audit";
import {
  listAvailabilityNoteHistory,
  listAvailabilityNotesForPeriod,
  upsertAvailabilityNote
} from "@/services/pc-factory-availability-notes.service";
import {
  AVAILABILITY_NOTE_WRITE_ROLES,
  AvailabilityNoteValidationError
} from "@/types/pc-factory-availability-note";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const sp = request.nextUrl.searchParams;
    const machine = sp.get("machine")?.trim();

    if (machine && sp.get("history") === "1") {
      const notes = await listAvailabilityNoteHistory(machine);
      return NextResponse.json({ ok: true, notes });
    }

    const start = sp.get("start")?.trim() ?? "";
    const end = sp.get("end")?.trim() ?? "";
    const notes = await listAvailabilityNotesForPeriod(start, end);
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    console.error("[pc-factory/availability-notes] Falha ao listar.", error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar as justificativas." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, AVAILABILITY_NOTE_WRITE_ROLES);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) ?? {};
    const session = await getSession();

    const note = await upsertAvailabilityNote(body, {
      id: session?.sub ?? null,
      name: session?.name ?? null
    });

    // Justificativa gerencial é rastreável: além do createdBy/updatedBy da própria
    // linha, a ação entra na auditoria administrativa do portal.
    await createAuditLog({
      action: AUDIT_ACTIONS.REGISTRAR_JUSTIFICATIVA_DISPONIBILIDADE,
      module: AUDIT_MODULES.PC_FACTORY,
      userId: session?.sub ?? null,
      userName: session?.name ?? null,
      entityId: note.id,
      entityName: `${note.resourceName} — ${note.periodLabel}`,
      ipAddress: getClientIp(request)
    });

    return NextResponse.json({ ok: true, note });
  } catch (error) {
    if (error instanceof AvailabilityNoteValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("[pc-factory/availability-notes] Falha ao salvar.", error);
    return NextResponse.json({ ok: false, message: "Não foi possível salvar a justificativa." }, { status: 500 });
  }
}

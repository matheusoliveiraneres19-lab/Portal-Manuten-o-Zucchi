/**
 * Serviço de EPI, Ferramentas e Anexos do colaborador (ETAPA 3).
 *
 * Regras de negócio:
 * - Status de EPI é DERIVADO de caValidUntil (Válido / a vencer / vencido).
 * - Anexos guardam apenas METADADOS aqui; o arquivo vive no Supabase Storage.
 * - A autorização por papel é feita na camada de API (requireRole).
 */
import { AttachmentKind, Prisma, ToolStatus, type Attachment, type EpiItem, type ToolItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AttachmentKindValue,
  AttachmentRow,
  EpiDerivedStatus,
  EpiItemRow,
  ExpiringEpiRow,
  ToolItemRow
} from "@/types/collaborators";

const DAY_MS = 86_400_000;

/** Janela padrão (dias) para considerar um EPI "a vencer". */
export const EPI_WARN_DAYS = 30;

/** Erro de validação de domínio — a API mapeia em 400. */
export class AssetValidationError extends Error {}

/** Mapeia violação de FK (colaborador inexistente) num erro de validação claro. */
function rethrowAsValidation(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    throw new AssetValidationError("Colaborador não encontrado.");
  }
  throw error;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function requireDate(value: string | null | undefined, field: string): Date {
  const date = parseDate(value);
  if (!date) throw new AssetValidationError(`Data inválida ou ausente: ${field}.`);
  return date;
}

/* ------------------------------------------------------------------ */
/* EPI                                                                 */
/* ------------------------------------------------------------------ */

/** Deriva o status do EPI a partir da validade do CA. */
export function deriveEpiStatus(
  caValidUntil: Date,
  now: Date,
  warnDays = EPI_WARN_DAYS
): { status: EpiDerivedStatus; daysToExpire: number } {
  const daysToExpire = Math.ceil((caValidUntil.getTime() - now.getTime()) / DAY_MS);
  let status: EpiDerivedStatus;
  if (daysToExpire < 0) status = "VENCIDO";
  else if (daysToExpire <= warnDays) status = "A_VENCER";
  else status = "VALIDO";
  return { status, daysToExpire };
}

function toEpiRow(record: EpiItem, now: Date): EpiItemRow {
  const { status, daysToExpire } = deriveEpiStatus(record.caValidUntil, now);
  return {
    id: record.id,
    name: record.name,
    caNumber: record.caNumber,
    caValidUntil: record.caValidUntil.toISOString(),
    deliveredAt: record.deliveredAt ? record.deliveredAt.toISOString() : null,
    notes: record.notes,
    status,
    daysToExpire
  };
}

export type EpiInput = {
  name?: string;
  caNumber?: string;
  caValidUntil?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
};

export async function listEpis(collaboratorId: string, now = new Date()): Promise<EpiItemRow[]> {
  const items = await prisma.epiItem.findMany({
    where: { collaboratorId },
    orderBy: { caValidUntil: "asc" }
  });
  return items.map((item) => toEpiRow(item, now));
}

export async function createEpi(collaboratorId: string, input: EpiInput, now = new Date()): Promise<EpiItemRow> {
  const name = (input.name ?? "").trim();
  const caNumber = (input.caNumber ?? "").trim();
  if (!name) throw new AssetValidationError("Nome do EPI é obrigatório.");
  if (!caNumber) throw new AssetValidationError("Número do CA é obrigatório.");
  const caValidUntil = requireDate(input.caValidUntil, "validade do CA");

  try {
    const created = await prisma.epiItem.create({
      data: {
        collaboratorId,
        name,
        caNumber,
        caValidUntil,
        deliveredAt: parseDate(input.deliveredAt),
        notes: input.notes?.trim() || null
      }
    });
    return toEpiRow(created, now);
  } catch (error) {
    rethrowAsValidation(error);
  }
}

export async function updateEpi(id: string, input: EpiInput, now = new Date()): Promise<EpiItemRow | null> {
  const data: Prisma.EpiItemUpdateInput = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new AssetValidationError("Nome do EPI não pode ser vazio.");
    data.name = name;
  }
  if (input.caNumber !== undefined) {
    const caNumber = input.caNumber.trim();
    if (!caNumber) throw new AssetValidationError("Número do CA não pode ser vazio.");
    data.caNumber = caNumber;
  }
  if (input.caValidUntil !== undefined) data.caValidUntil = requireDate(input.caValidUntil, "validade do CA");
  if (input.deliveredAt !== undefined) data.deliveredAt = parseDate(input.deliveredAt);
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

  try {
    const updated = await prisma.epiItem.update({ where: { id }, data });
    return toEpiRow(updated, now);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
    throw error;
  }
}

export async function deleteEpi(id: string): Promise<boolean> {
  try {
    await prisma.epiItem.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
    throw error;
  }
}

/**
 * EPIs a vencer (próximos `withinDays`) ou já vencidos, com o colaborador dono.
 * Base para o futuro alerta no dashboard.
 */
export async function listExpiringEpis(withinDays = EPI_WARN_DAYS, now = new Date()): Promise<ExpiringEpiRow[]> {
  const limit = new Date(now.getTime() + withinDays * DAY_MS);
  const items = await prisma.epiItem.findMany({
    where: { caValidUntil: { lte: limit } },
    orderBy: { caValidUntil: "asc" },
    include: { collaborator: { select: { id: true, name: true } } }
  });
  return items.map((item) => ({
    ...toEpiRow(item, now),
    collaboratorId: item.collaboratorId,
    collaboratorName: item.collaborator.name
  }));
}

/* ------------------------------------------------------------------ */
/* Ferramentas                                                         */
/* ------------------------------------------------------------------ */

function toToolRow(record: ToolItem): ToolItemRow {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    assignedAt: record.assignedAt ? record.assignedAt.toISOString() : null,
    returnedAt: record.returnedAt ? record.returnedAt.toISOString() : null,
    notes: record.notes
  };
}

export type ToolInput = {
  name?: string;
  status?: string;
  assignedAt?: string | null;
  returnedAt?: string | null;
  notes?: string | null;
};

function coerceToolStatus(value: unknown): ToolStatus | undefined {
  return typeof value === "string" && value in ToolStatus ? (value as ToolStatus) : undefined;
}

export async function listTools(collaboratorId: string): Promise<ToolItemRow[]> {
  const items = await prisma.toolItem.findMany({
    where: { collaboratorId },
    orderBy: [{ status: "asc" }, { name: "asc" }]
  });
  return items.map(toToolRow);
}

export async function createTool(collaboratorId: string, input: ToolInput): Promise<ToolItemRow> {
  const name = (input.name ?? "").trim();
  if (!name) throw new AssetValidationError("Nome da ferramenta é obrigatório.");
  const status = coerceToolStatus(input.status) ?? ToolStatus.EM_USO;

  try {
    const created = await prisma.toolItem.create({
      data: {
        collaboratorId,
        name,
        status,
        assignedAt: parseDate(input.assignedAt),
        returnedAt: parseDate(input.returnedAt),
        notes: input.notes?.trim() || null
      }
    });
    return toToolRow(created);
  } catch (error) {
    rethrowAsValidation(error);
  }
}

export async function updateTool(id: string, input: ToolInput): Promise<ToolItemRow | null> {
  const data: Prisma.ToolItemUpdateInput = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new AssetValidationError("Nome da ferramenta não pode ser vazio.");
    data.name = name;
  }
  if (input.status !== undefined) {
    const status = coerceToolStatus(input.status);
    if (!status) throw new AssetValidationError("Status de ferramenta inválido.");
    data.status = status;
  }
  if (input.assignedAt !== undefined) data.assignedAt = parseDate(input.assignedAt);
  if (input.returnedAt !== undefined) data.returnedAt = parseDate(input.returnedAt);
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

  try {
    const updated = await prisma.toolItem.update({ where: { id }, data });
    return toToolRow(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
    throw error;
  }
}

export async function deleteTool(id: string): Promise<boolean> {
  try {
    await prisma.toolItem.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Anexos (apenas metadados; arquivo no Storage)                       */
/* ------------------------------------------------------------------ */

function toAttachmentRow(record: Attachment): AttachmentRow {
  return {
    id: record.id,
    kind: record.kind,
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    uploadedAt: record.uploadedAt.toISOString()
  };
}

export function coerceAttachmentKind(value: unknown): AttachmentKindValue {
  return typeof value === "string" && value in AttachmentKind ? (value as AttachmentKindValue) : "OUTRO";
}

export async function listAttachments(collaboratorId: string): Promise<AttachmentRow[]> {
  const items = await prisma.attachment.findMany({
    where: { collaboratorId },
    orderBy: { uploadedAt: "desc" }
  });
  return items.map(toAttachmentRow);
}

export async function createAttachmentRecord(input: {
  collaboratorId: string;
  kind: AttachmentKindValue;
  fileName: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
}): Promise<AttachmentRow> {
  const created = await prisma.attachment.create({
    data: {
      collaboratorId: input.collaboratorId,
      kind: input.kind as AttachmentKind,
      fileName: input.fileName,
      storagePath: input.storagePath,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes
    }
  });
  return toAttachmentRow(created);
}

/** Retorna o registro bruto (inclui storagePath) — para gerar URL/excluir. */
export async function getAttachmentRecord(id: string): Promise<Attachment | null> {
  return prisma.attachment.findUnique({ where: { id } });
}

export async function deleteAttachmentRecord(id: string): Promise<boolean> {
  try {
    await prisma.attachment.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
    throw error;
  }
}

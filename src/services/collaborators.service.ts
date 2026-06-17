import { CollaboratorArea, CollaboratorStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeNameKey } from "@/lib/name-normalizer";
import type {
  CollaboratorInput,
  CollaboratorListParams,
  CollaboratorListResult,
  CollaboratorRow
} from "@/types/collaborators";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MONTHLY_GOAL = 220;

/** Erros de domínio para a camada de API mapear em 400/409. */
export class CollaboratorValidationError extends Error {}
export class CollaboratorConflictError extends Error {}

const collaboratorSelect = {
  id: true,
  matricula: true,
  name: true,
  role: true,
  area: true,
  shift: true,
  monthlyGoal: true,
  status: true,
  admissionDate: true,
  createdAt: true
} satisfies Prisma.CollaboratorSelect;

type CollaboratorPayload = Prisma.CollaboratorGetPayload<{ select: typeof collaboratorSelect }>;

function toRow(record: CollaboratorPayload): CollaboratorRow {
  return {
    id: record.id,
    matricula: record.matricula,
    name: record.name,
    role: record.role,
    area: record.area,
    shift: record.shift,
    monthlyGoal: record.monthlyGoal,
    status: record.status,
    admissionDate: record.admissionDate ? record.admissionDate.toISOString() : null,
    createdAt: record.createdAt.toISOString()
  };
}

export function coerceArea(value: unknown): CollaboratorArea | undefined {
  return typeof value === "string" && value in CollaboratorArea ? (value as CollaboratorArea) : undefined;
}

export function coerceStatus(value: unknown): CollaboratorStatus | undefined {
  return typeof value === "string" && value in CollaboratorStatus ? (value as CollaboratorStatus) : undefined;
}

function parseAdmissionDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function listCollaborators(params: CollaboratorListParams = {}): Promise<CollaboratorListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));

  const where: Prisma.CollaboratorWhereInput = {};
  if (params.status) where.status = params.status;
  if (params.area) where.area = params.area;

  const term = params.search?.trim();
  if (term) {
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { matricula: { contains: term, mode: "insensitive" } },
      { role: { contains: term, mode: "insensitive" } },
      { nameKey: { contains: normalizeNameKey(term) } }
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.collaborator.count({ where }),
    prisma.collaborator.findMany({
      where,
      select: collaboratorSelect,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return {
    data: rows.map(toRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function getCollaboratorById(id: string): Promise<CollaboratorRow | null> {
  const record = await prisma.collaborator.findUnique({ where: { id }, select: collaboratorSelect });
  return record ? toRow(record) : null;
}

export async function createCollaborator(input: CollaboratorInput): Promise<CollaboratorRow> {
  const matricula = (input.matricula ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!matricula) throw new CollaboratorValidationError("Matrícula é obrigatória.");
  if (!name) throw new CollaboratorValidationError("Nome é obrigatório.");

  const monthlyGoal =
    typeof input.monthlyGoal === "number" && Number.isFinite(input.monthlyGoal) && input.monthlyGoal >= 0
      ? input.monthlyGoal
      : DEFAULT_MONTHLY_GOAL;

  try {
    const created = await prisma.collaborator.create({
      data: {
        matricula,
        name,
        nameKey: normalizeNameKey(name),
        role: input.role?.trim() || null,
        area: coerceArea(input.area) ?? CollaboratorArea.OUTROS,
        shift: input.shift?.trim() || null,
        monthlyGoal,
        status: coerceStatus(input.status) ?? CollaboratorStatus.ATIVO,
        admissionDate: parseAdmissionDate(input.admissionDate)
      },
      select: collaboratorSelect
    });
    return toRow(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CollaboratorConflictError("Já existe um colaborador com esta matrícula.");
    }
    throw error;
  }
}

/** Atualiza apenas os campos enviados. Retorna null se o id não existir. */
export async function updateCollaborator(id: string, input: CollaboratorInput): Promise<CollaboratorRow | null> {
  const data: Prisma.CollaboratorUpdateInput = {};

  if (input.matricula !== undefined) {
    const matricula = input.matricula.trim();
    if (!matricula) throw new CollaboratorValidationError("Matrícula não pode ser vazia.");
    data.matricula = matricula;
  }
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new CollaboratorValidationError("Nome não pode ser vazio.");
    data.name = name;
    data.nameKey = normalizeNameKey(name);
  }
  if (input.role !== undefined) data.role = input.role?.trim() || null;
  if (input.area !== undefined) {
    const area = coerceArea(input.area);
    if (area) data.area = area;
  }
  if (input.shift !== undefined) data.shift = input.shift?.trim() || null;
  if (input.monthlyGoal !== undefined && Number.isFinite(input.monthlyGoal) && input.monthlyGoal >= 0) {
    data.monthlyGoal = input.monthlyGoal;
  }
  if (input.status !== undefined) {
    const status = coerceStatus(input.status);
    if (status) data.status = status;
  }
  if (input.admissionDate !== undefined) data.admissionDate = parseAdmissionDate(input.admissionDate);

  try {
    const updated = await prisma.collaborator.update({ where: { id }, data, select: collaboratorSelect });
    return toRow(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return null; // registro não encontrado
      if (error.code === "P2002") throw new CollaboratorConflictError("Já existe um colaborador com esta matrícula.");
    }
    throw error;
  }
}

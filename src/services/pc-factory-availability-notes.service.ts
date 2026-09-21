/**
 * JUSTIFICATIVA DE BAIXA DISPONIBILIDADE — leitura e escrita.
 *
 * REGRA INEGOCIÁVEL DESTE MÓDULO: ele não calcula nada. Não lê
 * `PcFactoryRecord`, não soma horas, não deriva percentual. `reason`,
 * `actionPlan` e `responsible` são texto gerencial e nunca são entrada de
 * Disponibilidade Física, Horas de Parada, Tempo Total, MTBF, MTTR ou MTTA — que
 * seguem inteiramente em `pc-factory.service` / `pc-factory-physical-availability`.
 *
 * CHAVE: (`resourceName`, `periodStart`, `periodEnd`). Máquina **mais** período,
 * porque o motivo de agosto/2026 não vale para setembro/2026. Trocar o filtro
 * busca a justificativa da nova janela e a antiga continua no banco, intacta, na
 * janela dela — o histórico não é sobrescrito.
 *
 * `resourceName` é a chave canônica de máquina do módulo: é o campo pelo qual a
 * tabela de confiabilidade agrupa (`groupRecordsByMachine`) e é o que a linha
 * clicada manda para o painel de detalhes. `resourceCode` existe no
 * `PcFactoryRecord`, mas vem majoritariamente nulo na base importada, então serve
 * só como identificação auxiliar guardada junto — nunca como chave.
 */
import { prisma } from "@/lib/prisma";
import {
  AVAILABILITY_NOTE_LIMITS,
  AvailabilityNoteValidationError,
  type PcFactoryAvailabilityNoteDTO,
  type PcFactoryAvailabilityNoteInput
} from "@/types/pc-factory-availability-note";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "YYYY-MM-DD" → meia-noite UTC daquele dia. Coluna `DATE` no Postgres, então o
 * horário é irrelevante no banco — mas fixar UTC aqui evita que o fuso do
 * servidor empurre a data um dia para trás e quebre a chave do período.
 */
function toPeriodDate(value: string, field: string): Date {
  if (!ISO_DATE.test(value)) {
    throw new AvailabilityNoteValidationError(`Data inválida em "${field}". Use o formato AAAA-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new AvailabilityNoteValidationError(`Data inválida em "${field}".`);
  }
  return date;
}

/** Date do banco → "YYYY-MM-DD" (sempre lido em UTC, como foi gravado). */
function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatBr(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? isoDay : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Texto opcional: vazio vira null (não grava string em branco). */
function optionalText(value: string | null | undefined, max: number, field: string): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new AvailabilityNoteValidationError(`O campo "${field}" excede ${max} caracteres.`);
  }
  return trimmed;
}

/** Snapshot numérico: só grava número finito; qualquer outra coisa vira null. */
function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type NoteRow = {
  id: string;
  resourceName: string;
  resourceCode: string | null;
  periodStart: Date;
  periodEnd: Date;
  reason: string;
  actionPlan: string | null;
  responsible: string | null;
  availabilitySnapshot: number | null;
  downtimeHoursSnapshot: number | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedById: string | null;
  updatedByName: string | null;
  updatedAt: Date;
};

function toDTO(row: NoteRow): PcFactoryAvailabilityNoteDTO {
  const periodStart = toIsoDay(row.periodStart);
  const periodEnd = toIsoDay(row.periodEnd);
  return {
    id: row.id,
    resourceName: row.resourceName,
    resourceCode: row.resourceCode,
    periodStart,
    periodEnd,
    periodLabel: `${formatBr(periodStart)} a ${formatBr(periodEnd)}`,
    reason: row.reason,
    actionPlan: row.actionPlan,
    responsible: row.responsible,
    availabilitySnapshot: row.availabilitySnapshot,
    downtimeHoursSnapshot: row.downtimeHoursSnapshot,
    createdById: row.createdById,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedById: row.updatedById,
    updatedByName: row.updatedByName,
    updatedAt: row.updatedAt.toISOString()
  };
}

/* ------------------------------------------------------------------ */
/* Leitura                                                            */
/* ------------------------------------------------------------------ */

/**
 * Justificativas de UM período — as que a tabela exibe no recorte atual.
 *
 * O filtro é por igualdade das duas pontas, não por sobreposição: a justificativa
 * pertence à janela exata em que foi escrita. Por isso, ao mudar de agosto para
 * setembro, o texto de agosto simplesmente não volta na consulta (requisito 17).
 *
 * Janela inválida (sem data) devolve lista vazia em vez de erro: a tela sem
 * filtro de período ainda precisa renderizar.
 */
export async function listAvailabilityNotesForPeriod(
  periodStart: string,
  periodEnd: string
): Promise<PcFactoryAvailabilityNoteDTO[]> {
  if (!ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) return [];

  const rows = await prisma.pcFactoryAvailabilityNote.findMany({
    where: {
      periodStart: new Date(`${periodStart}T00:00:00.000Z`),
      periodEnd: new Date(`${periodEnd}T00:00:00.000Z`)
    },
    orderBy: { resourceName: "asc" }
  });

  return rows.map(toDTO);
}

/**
 * Histórico de uma máquina: todas as janelas já justificadas, da mais recente
 * para a mais antiga. É o que alimenta o bloco "Histórico de justificativas" do
 * painel — nada é apagado quando um novo período é justificado.
 */
export async function listAvailabilityNoteHistory(
  resourceName: string,
  limit = 12
): Promise<PcFactoryAvailabilityNoteDTO[]> {
  const name = resourceName.trim();
  if (!name) return [];

  const rows = await prisma.pcFactoryAvailabilityNote.findMany({
    where: { resourceName: name },
    orderBy: [{ periodStart: "desc" }, { periodEnd: "desc" }],
    take: Math.min(Math.max(limit, 1), 50)
  });

  return rows.map(toDTO);
}

/* ------------------------------------------------------------------ */
/* Escrita                                                            */
/* ------------------------------------------------------------------ */

export type AvailabilityNoteAuthor = {
  id: string | null;
  name: string | null;
};

/**
 * Cria ou atualiza a justificativa da máquina NAQUELE período.
 *
 * `upsert` sobre a chave única (máquina + período): editar agosto não encosta em
 * setembro. A auditoria de criação (`createdBy*`, `createdAt`) é preservada na
 * edição — só `updatedBy*` / `updatedAt` mudam, que é o que permite responder
 * "quem escreveu" e "quem alterou depois".
 */
export async function upsertAvailabilityNote(
  input: PcFactoryAvailabilityNoteInput,
  author: AvailabilityNoteAuthor
): Promise<PcFactoryAvailabilityNoteDTO> {
  const resourceName = String(input.resourceName ?? "").trim();
  if (!resourceName) {
    throw new AvailabilityNoteValidationError("Informe a máquina da justificativa.");
  }

  const periodStart = toPeriodDate(String(input.periodStart ?? ""), "periodStart");
  const periodEnd = toPeriodDate(String(input.periodEnd ?? ""), "periodEnd");
  if (periodEnd.getTime() < periodStart.getTime()) {
    throw new AvailabilityNoteValidationError("O fim do período não pode ser anterior ao início.");
  }

  const reason = String(input.reason ?? "").trim();
  if (!reason) {
    throw new AvailabilityNoteValidationError("A justificativa não pode ficar em branco.");
  }
  if (reason.length > AVAILABILITY_NOTE_LIMITS.reason) {
    throw new AvailabilityNoteValidationError(
      `A justificativa excede ${AVAILABILITY_NOTE_LIMITS.reason} caracteres.`
    );
  }

  const actionPlan = optionalText(input.actionPlan, AVAILABILITY_NOTE_LIMITS.actionPlan, "Plano de ação");
  const responsible = optionalText(input.responsible, AVAILABILITY_NOTE_LIMITS.responsible, "Responsável");
  const resourceCode = optionalText(input.resourceCode, 120, "Código do recurso");
  const availabilitySnapshot = optionalNumber(input.availabilitySnapshot);
  const downtimeHoursSnapshot = optionalNumber(input.downtimeHoursSnapshot);

  const row = await prisma.pcFactoryAvailabilityNote.upsert({
    where: {
      resourceName_periodStart_periodEnd: { resourceName, periodStart, periodEnd }
    },
    create: {
      resourceName,
      resourceCode,
      periodStart,
      periodEnd,
      reason,
      actionPlan,
      responsible,
      availabilitySnapshot,
      downtimeHoursSnapshot,
      createdById: author.id,
      createdByName: author.name,
      updatedById: author.id,
      updatedByName: author.name
    },
    update: {
      // createdBy*/createdAt ficam como estão: a autoria original é parte da
      // auditoria e não pode ser reescrita por quem editou depois.
      resourceCode,
      reason,
      actionPlan,
      responsible,
      availabilitySnapshot,
      downtimeHoursSnapshot,
      updatedById: author.id,
      updatedByName: author.name
    }
  });

  return toDTO(row);
}

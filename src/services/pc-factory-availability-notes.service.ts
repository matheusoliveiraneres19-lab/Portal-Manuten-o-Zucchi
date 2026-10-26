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
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  describeServiceOrders,
  normalizeOsNumber,
  type ServiceOrderSummary
} from "@/services/service-order-lookup.service";
import {
  AVAILABILITY_NOTE_LIMITS,
  AvailabilityNoteValidationError,
  type LinkedServiceOrderDTO,
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

/** Vínculos lidos junto com a nota (o detalhe da OS vem de `describeServiceOrders`). */
const LINK_SELECT = {
  id: true,
  osNumber: true,
  serviceOrderId: true,
  createdByName: true,
  createdAt: true
} satisfies Prisma.PcFactoryAvailabilityNoteServiceOrderSelect;

type LinkRow = Prisma.PcFactoryAvailabilityNoteServiceOrderGetPayload<{ select: typeof LINK_SELECT }>;

const NOTE_INCLUDE = {
  serviceOrderLinks: { select: LINK_SELECT, orderBy: { createdAt: "asc" } }
} satisfies Prisma.PcFactoryAvailabilityNoteInclude;

type NoteRow = Prisma.PcFactoryAvailabilityNoteGetPayload<{ include: typeof NOTE_INCLUDE }>;

function toLinkDTO(link: LinkRow, orders: Map<string, ServiceOrderSummary>): LinkedServiceOrderDTO {
  const order = orders.get(link.osNumber);
  return {
    linkId: link.id,
    osNumber: link.osNumber,
    serviceOrderId: link.serviceOrderId,
    found: Boolean(order),
    title: order?.title ?? null,
    planningGroupLabel: order?.planningGroupLabel ?? null,
    statusLabel: order?.statusLabel ?? null,
    closed: order?.closed ?? false,
    equipmentLabel: order?.equipmentLabel ?? null,
    openedAt: order?.openedAt?.toISOString() ?? null,
    linkedByName: link.createdByName,
    linkedAt: link.createdAt.toISOString()
  };
}

function toDTO(row: NoteRow, orders: Map<string, ServiceOrderSummary>): PcFactoryAvailabilityNoteDTO {
  const periodStart = toIsoDay(row.periodStart);
  const periodEnd = toIsoDay(row.periodEnd);
  return {
    id: row.id,
    resourceName: row.resourceName,
    resourceCode: row.resourceCode,
    periodStart,
    periodEnd,
    periodLabel: `${formatBr(periodStart)} a ${formatBr(periodEnd)}`,
    cause: row.cause,
    reason: row.reason,
    actionPlan: row.actionPlan,
    responsible: row.responsible,
    serviceOrders: row.serviceOrderLinks.map((link) => toLinkDTO(link, orders)),
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

/** Converte várias notas buscando os dados das OS de TODAS elas numa só consulta. */
async function toDTOs(rows: NoteRow[]): Promise<PcFactoryAvailabilityNoteDTO[]> {
  const osNumbers = rows.flatMap((row) => row.serviceOrderLinks.map((link) => link.osNumber));
  // Falha ao descrever as OS não pode esconder a justificativa: o vínculo aparece
  // com o número e o aviso de "não encontrada", em vez de a nota sumir.
  const orders = await describeServiceOrders(osNumbers).catch((error) => {
    console.error("[pc-factory/availability-notes] Falha ao descrever OS vinculadas.", error);
    return new Map<string, ServiceOrderSummary>();
  });
  return rows.map((row) => toDTO(row, orders));
}

/* ------------------------------------------------------------------ */
/* Leitura                                                            */
/* ------------------------------------------------------------------ */

/**
 * Justificativas de UM período — as que a tabela exibe no recorte atual.
 *
 * O filtro é por igualdade das duas pontas, não por sobreposição: a justificativa
 * pertence à janela exata em que foi escrita. Por isso, ao mudar de agosto para
 * setembro, o texto de agosto simplesmente não volta na consulta (requisito 17) —
 * e as OS vinculadas vêm junto, presas à sua nota, nunca misturadas entre janelas.
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
    include: NOTE_INCLUDE,
    orderBy: { resourceName: "asc" }
  });

  return toDTOs(rows);
}

/**
 * Histórico de uma máquina: todas as janelas já justificadas, da mais recente
 * para a mais antiga, cada uma com as SUAS OS. É o que alimenta o bloco
 * "Histórico de justificativas" do painel — nada é apagado quando um novo período
 * é justificado.
 */
export async function listAvailabilityNoteHistory(
  resourceName: string,
  limit = 12
): Promise<PcFactoryAvailabilityNoteDTO[]> {
  const name = resourceName.trim();
  if (!name) return [];

  const rows = await prisma.pcFactoryAvailabilityNote.findMany({
    where: { resourceName: name },
    include: NOTE_INCLUDE,
    orderBy: [{ periodStart: "desc" }, { periodEnd: "desc" }],
    take: Math.min(Math.max(limit, 1), 50)
  });

  return toDTOs(rows);
}

/* ------------------------------------------------------------------ */
/* Escrita                                                            */
/* ------------------------------------------------------------------ */

export type AvailabilityNoteAuthor = {
  id: string | null;
  name: string | null;
};

/** O que mudou nos vínculos — a rota grava cada item no AuditLog. */
export type AvailabilityNoteLinkChanges = {
  added: string[];
  removed: string[];
};

/** Lista de números de OS enviada pela tela → números únicos, validados no formato. */
function parseServiceOrderNumbers(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new AvailabilityNoteValidationError("Lista de Ordens de Serviço inválida.");
  }
  const numbers = Array.from(new Set(value.map(normalizeOsNumber).filter(Boolean)));
  if (numbers.length > AVAILABILITY_NOTE_LIMITS.serviceOrders) {
    throw new AvailabilityNoteValidationError(
      `Vincule no máximo ${AVAILABILITY_NOTE_LIMITS.serviceOrders} Ordens de Serviço por justificativa.`
    );
  }
  if (numbers.some((number) => number.length > 30)) {
    throw new AvailabilityNoteValidationError("Número de Ordem de Serviço inválido.");
  }
  return numbers;
}

/**
 * Cria ou atualiza a justificativa da máquina NAQUELE período e, quando a tela
 * manda a lista de OS, sincroniza os vínculos.
 *
 * `upsert` sobre a chave única (máquina + período): editar agosto não encosta em
 * setembro. A auditoria de criação (`createdBy*`, `createdAt`) é preservada na
 * edição — só `updatedBy*` / `updatedAt` mudam.
 *
 * VÍNCULOS: toda OS precisa existir na base atual — número desconhecido recusa o
 * salvamento inteiro ("Ordem de Serviço não encontrada na base atual"), antes de
 * gravar qualquer coisa. Remover um vínculo apaga só a linha do vínculo; a
 * ServiceOrder nunca é alterada. Nota e vínculos são gravados numa transação.
 */
export async function saveAvailabilityNote(
  input: PcFactoryAvailabilityNoteInput,
  author: AvailabilityNoteAuthor
): Promise<{ note: PcFactoryAvailabilityNoteDTO; linkChanges: AvailabilityNoteLinkChanges }> {
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

  const cause = optionalText(input.cause, AVAILABILITY_NOTE_LIMITS.cause, "Motivo");
  const actionPlan = optionalText(input.actionPlan, AVAILABILITY_NOTE_LIMITS.actionPlan, "Plano de ação");
  const responsible = optionalText(input.responsible, AVAILABILITY_NOTE_LIMITS.responsible, "Responsável");
  const resourceCode = optionalText(input.resourceCode, 120, "Código do recurso");
  const availabilitySnapshot = optionalNumber(input.availabilitySnapshot);
  const downtimeHoursSnapshot = optionalNumber(input.downtimeHoursSnapshot);

  // Valida as OS ANTES de gravar: um número inexistente não deixa nota pela metade.
  const wanted = parseServiceOrderNumbers(input.serviceOrderNumbers);
  const orders = wanted ? await describeServiceOrders(wanted) : new Map<string, ServiceOrderSummary>();
  if (wanted) {
    const missing = wanted.filter((number) => !orders.has(number));
    if (missing.length) {
      throw new AvailabilityNoteValidationError(
        `Ordem de Serviço não encontrada na base atual: ${missing.join(", ")}.`
      );
    }
  }

  const linkChanges: AvailabilityNoteLinkChanges = { added: [], removed: [] };

  const row = await prisma.$transaction(async (tx) => {
    const note = await tx.pcFactoryAvailabilityNote.upsert({
      where: {
        resourceName_periodStart_periodEnd: { resourceName, periodStart, periodEnd }
      },
      create: {
        resourceName,
        resourceCode,
        periodStart,
        periodEnd,
        cause,
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
        cause,
        reason,
        actionPlan,
        responsible,
        availabilitySnapshot,
        downtimeHoursSnapshot,
        updatedById: author.id,
        updatedByName: author.name
      },
      select: { id: true }
    });

    if (wanted) {
      const current = await tx.pcFactoryAvailabilityNoteServiceOrder.findMany({
        where: { availabilityNoteId: note.id },
        select: { id: true, osNumber: true }
      });
      const currentNumbers = new Set(current.map((link) => link.osNumber));
      const wantedNumbers = new Set(wanted);

      const toRemove = current.filter((link) => !wantedNumbers.has(link.osNumber));
      if (toRemove.length) {
        // Só a linha do VÍNCULO. Nenhum `serviceOrder.delete*` existe neste módulo.
        await tx.pcFactoryAvailabilityNoteServiceOrder.deleteMany({
          where: { id: { in: toRemove.map((link) => link.id) } }
        });
        linkChanges.removed = toRemove.map((link) => link.osNumber);
      }

      const toAdd = wanted.filter((number) => !currentNumbers.has(number));
      if (toAdd.length) {
        await tx.pcFactoryAvailabilityNoteServiceOrder.createMany({
          data: toAdd.map((osNumber) => ({
            availabilityNoteId: note.id,
            osNumber,
            serviceOrderId: orders.get(osNumber)?.serviceOrderId ?? null,
            createdById: author.id,
            createdByName: author.name
          })),
          skipDuplicates: true
        });
        linkChanges.added = toAdd;
      }
    }

    return tx.pcFactoryAvailabilityNote.findUniqueOrThrow({ where: { id: note.id }, include: NOTE_INCLUDE });
  });

  return { note: toDTO(row, wanted ? orders : await describeServiceOrders(row.serviceOrderLinks.map((l) => l.osNumber))), linkChanges };
}

/** Compatibilidade: grava e devolve só a justificativa. */
export async function upsertAvailabilityNote(
  input: PcFactoryAvailabilityNoteInput,
  author: AvailabilityNoteAuthor
): Promise<PcFactoryAvailabilityNoteDTO> {
  return (await saveAvailabilityNote(input, author)).note;
}

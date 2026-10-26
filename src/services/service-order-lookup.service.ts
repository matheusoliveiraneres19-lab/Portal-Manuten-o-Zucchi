/**
 * ORDENS DE SERVIÇO por NÚMERO — leitura para quem só precisa citar uma OS
 * (justificativa de baixa disponibilidade do PC-Factory e o seu autocomplete).
 *
 * `ServiceOrder` guarda uma linha por OPERAÇÃO ([osNumber, operationCode]); aqui
 * tudo é consolidado por `osNumber`, com as regras centrais do portal:
 *  - FECHADA só quando TODAS as operações são reconhecidas por `isClosedServiceOrder`;
 *    senão o status da 1ª operação pendente;
 *  - grupo pelo normalizador central `resolvePlanningGroup`;
 *  - registros de teste sem equipamento ficam de fora, como em toda a aba de OS.
 *
 * Nunca escreve em ServiceOrder.
 */
import { Prisma, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  excludeInvalidTestEquipmentWhere,
  isClosedServiceOrder,
  isProgrammedPreventiveOrder
} from "@/utils/service-order-classification";
import { PLANNING_GROUP_LABELS, resolvePlanningGroup } from "@/utils/service-order-planning";
import { formatTechnicalObject } from "@/utils/technical-object-normalizer";
import { matchSapMachineTags } from "@/utils/pc-factory-sap-machine";
import { getFunctionalLocationLookup } from "@/services/shared/functional-location-lookup";
import type { ServiceOrderSearchItem, ServiceOrderSearchResult } from "@/types/pc-factory-availability-note";

const STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  ABERTA: "Aberta",
  LIBERADA: "Liberada",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_MATERIAL: "Aguardando material",
  FECHADA: "Fechada",
  CANCELADA: "Cancelada"
};

const ROW_SELECT = {
  id: true,
  osNumber: true,
  operationCode: true,
  title: true,
  status: true,
  statusSapRaw: true,
  planningGroup: true,
  planningGroupCode: true,
  equipmentName: true,
  equipmentCode: true,
  technicalObjectRaw: true,
  openedAt: true
} satisfies Prisma.ServiceOrderSelect;

type Row = Prisma.ServiceOrderGetPayload<{ select: typeof ROW_SELECT }>;

/** Uma OS consolidada a partir das suas operações. */
export type ServiceOrderSummary = {
  osNumber: string;
  /** Operação de referência (menor operationCode) — é o id que o vínculo guarda. */
  serviceOrderId: string;
  title: string;
  planningGroupLabel: string;
  statusLabel: string;
  closed: boolean;
  equipmentLabel: string;
  equipmentCode: string | null;
  technicalObjectRaw: string | null;
  openedAt: Date | null;
};

/** Linhas ORDENADAS por (osNumber, operationCode) → uma entrada por OS. */
function consolidate(rows: Row[]): Map<string, ServiceOrderSummary> {
  const byOrder = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byOrder.get(row.osNumber);
    if (list) list.push(row);
    else byOrder.set(row.osNumber, [row]);
  }

  const out = new Map<string, ServiceOrderSummary>();
  byOrder.forEach((ops, osNumber) => {
    const first = ops[0];
    const pending = ops.find((op) => !isClosedServiceOrder(op));
    const group = ops.map((op) => resolvePlanningGroup(op)).find((key) => key !== "OUTROS") ?? "OUTROS";
    out.set(osNumber, {
      osNumber,
      serviceOrderId: first.id,
      title: first.title,
      planningGroupLabel: PLANNING_GROUP_LABELS[group],
      statusLabel: pending ? STATUS_LABEL[pending.status] : "Fechada",
      closed: !pending,
      equipmentLabel: formatTechnicalObject(first.equipmentName, first.equipmentCode),
      equipmentCode: first.equipmentCode,
      technicalObjectRaw: first.technicalObjectRaw,
      openedAt: ops.find((op) => op.openedAt)?.openedAt ?? null
    });
  });
  return out;
}

/** Número de OS digitado → forma gravada no banco (sem espaços nem zeros perdidos). */
export function normalizeOsNumber(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

/** Dados atuais de várias OS, em UMA consulta. OS ausente da base não aparece no Map. */
export async function describeServiceOrders(osNumbers: string[]): Promise<Map<string, ServiceOrderSummary>> {
  const unique = Array.from(new Set(osNumbers.map(normalizeOsNumber).filter(Boolean)));
  if (!unique.length) return new Map();

  const rows = await prisma.serviceOrder.findMany({
    where: { AND: [excludeInvalidTestEquipmentWhere(), { osNumber: { in: unique } }] },
    select: ROW_SELECT,
    orderBy: [{ osNumber: "asc" }, { operationCode: "asc" }]
  });
  return consolidate(rows);
}

export type ServiceOrderSearchParams = {
  query?: string;
  /** `resourceName` do PC-Factory — usado só para priorizar. */
  machine?: string;
  /** "YYYY-MM-DD" — período da justificativa, usado só para priorizar. */
  dateFrom?: string;
  dateTo?: string;
  scope?: "machine" | "all";
  limit?: number;
};

const MAX_LIMIT = 20;
/** OS candidatas lidas por busca antes de ranquear — teto de segurança. */
const CANDIDATE_CAP = 300;
/** Caracteres mínimos para buscar fora da máquina (evita varrer a base por "4"). */
export const MIN_QUERY_ALL = 3;

/**
 * AUTOCOMPLETE de OS para a justificativa.
 *
 *  - `scope=machine` (padrão): só OS do equipamento SAP que corresponde à máquina
 *    (`matchSapMachineTags`). Sem texto, lista as OS da máquina — as do período
 *    primeiro. Máquina sem correspondência devolve vazio com `machineTags: []`, e a
 *    tela oferece "Buscar em todas as OS".
 *  - `scope=all`: todas as OS que casam com o texto, MESMA máquina e MESMO período
 *    primeiro. O período nunca filtra — uma OS aberta antes da parada é legítima.
 *
 * Duas consultas leves (candidatas distintas → descrição só das exibidas), mais o
 * cadastro de locais em cache. No máximo 20 resultados.
 */
export async function searchServiceOrders(params: ServiceOrderSearchParams): Promise<ServiceOrderSearchResult> {
  const query = (params.query ?? "").trim();
  const scope = params.scope === "all" ? "all" : "machine";
  const limit = Math.min(Math.max(params.limit ?? 10, 1), MAX_LIMIT);

  const lookup = await getFunctionalLocationLookup();
  const machineTags = params.machine ? matchSapMachineTags(params.machine, lookup.keys()) : [];

  const machineWhere: Prisma.ServiceOrderWhereInput | null = machineTags.length
    ? {
        OR: machineTags.flatMap((tag) => [
          { equipmentCode: { startsWith: tag, mode: "insensitive" as const } },
          { technicalObjectRaw: { contains: tag, mode: "insensitive" as const } }
        ])
      }
    : null;

  // Sem texto só faz sentido dentro da máquina; sem máquina reconhecida, nada a sugerir.
  if (scope === "machine" && !machineWhere) return { items: [], scope, machineTags };
  if (scope === "all" && query.length < MIN_QUERY_ALL) return { items: [], scope, machineTags };

  const and: Prisma.ServiceOrderWhereInput[] = [excludeInvalidTestEquipmentWhere()];
  if (query) {
    // Número digitado = começo do número da OS ("45012" → 45012345): prefixo usa o
    // índice e não arrasta a base inteira. Texto procura no título.
    and.push(
      /^\d+$/.test(query)
        ? { osNumber: { startsWith: query } }
        : { OR: [{ osNumber: { contains: query } }, { title: { contains: query, mode: "insensitive" } }] }
    );
  }
  if (scope === "machine" && machineWhere) and.push(machineWhere);

  // 1. Quais OS casam — uma linha por OS (`distinct`), só com o que o ranking usa.
  //    Local e data-base são da ordem, iguais em todas as operações.
  const candidates = await prisma.serviceOrder.findMany({
    where: { AND: and },
    select: { osNumber: true, title: true, openedAt: true, equipmentCode: true, technicalObjectRaw: true },
    distinct: ["osNumber"],
    orderBy: [{ osNumber: "desc" }],
    take: CANDIDATE_CAP
  });

  const from = isIsoDay(params.dateFrom) ? new Date(`${params.dateFrom}T00:00:00.000Z`) : null;
  const to = isIsoDay(params.dateTo) ? new Date(`${params.dateTo}T23:59:59.999Z`) : null;
  const upperTags = machineTags.map((tag) => tag.toUpperCase());

  const ranked = candidates
    .map((row) => {
      const code = (row.equipmentCode ?? "").toUpperCase();
      const raw = (row.technicalObjectRaw ?? "").toUpperCase();
      const sameMachine = upperTags.some((tag) => code.startsWith(tag) || raw.includes(tag));
      const inPeriod = Boolean(row.openedAt && (!from || row.openedAt >= from) && (!to || row.openedAt <= to));
      // Peso: número exato > mesma máquina > mesmo período > corretiva > prefixo do número.
      // Corretiva acima de PL/PV (regra oficial do portal): uma parada costuma ser
      // justificada por intervenção corretiva, não pela lubrificação de rotina.
      const score =
        (row.osNumber === query ? 16 : 0) +
        (sameMachine ? 8 : 0) +
        (inPeriod ? 4 : 0) +
        (isProgrammedPreventiveOrder(row) ? 0 : 2) +
        (query && row.osNumber.startsWith(query) ? 1 : 0);
      return { osNumber: row.osNumber, openedAt: row.openedAt, sameMachine, inPeriod, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.openedAt?.getTime() ?? 0) - (a.openedAt?.getTime() ?? 0) ||
        b.osNumber.localeCompare(a.osNumber)
    )
    .slice(0, limit);

  // 2. Só as que vão aparecer, com TODAS as operações — status e grupo corretos.
  const described = await describeServiceOrders(ranked.map((item) => item.osNumber));

  const items: ServiceOrderSearchItem[] = ranked.flatMap((item) => {
    const order = described.get(item.osNumber);
    if (!order) return [];
    return [
      {
        osNumber: order.osNumber,
        serviceOrderId: order.serviceOrderId,
        title: order.title,
        planningGroupLabel: order.planningGroupLabel,
        statusLabel: order.statusLabel,
        closed: order.closed,
        equipmentLabel: order.equipmentLabel,
        openedAt: order.openedAt?.toISOString() ?? null,
        sameMachine: item.sameMachine,
        inPeriod: item.inPeriod
      }
    ];
  });

  return { items, scope, machineTags };
}

function isIsoDay(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

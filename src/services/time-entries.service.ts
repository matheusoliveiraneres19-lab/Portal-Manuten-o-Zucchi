/**
 * Service de Horas Apontadas — fonte única das horas por colaborador.
 *
 * Fonte primária: tabela TimeEntry (apontamento dedicado).
 * Fallback: quando não há TimeEntry no período, agrega ServiceOrder.workedHours
 * por responsável (responsibleName) — mesma base usada em Equipamentos Críticos.
 *
 * Cada linha carrega também a quantidade de Ordens de Serviço (orders) do
 * colaborador no período, vinda SEMPRE das Ordens de Serviço (responsibleName),
 * independentemente da fonte das horas — assim a aba Início e a aba Equipe e Horas
 * exibem nome + horas + nº de ordens de forma consistente.
 */
import { prisma } from "@/lib/prisma";
import { normalizeNameKey } from "@/lib/name-normalizer";
import { withinPeriod, type DateRange } from "@/utils/date-range";
import { excludeLubricationOrderWhere } from "@/utils/service-order-filters";
import type { HoursByCollaboratorData } from "@/types/dashboard";

const NO_RESPONSIBLE_LABEL = "SEM RESPONSÁVEL";

/** Horas saneadas: ignora null/NaN/Infinity/negativos. */
function safeHours(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Horas apontadas por colaborador no período.
 *
 * Fonte: TimeEntry (apontamento dedicado) QUANDO tem cobertura real — ou seja,
 * total ao menos igual às horas registradas nas Ordens de Serviço. Caso contrário
 * (ex.: TimeEntry ainda com poucos registros), as Ordens de Serviço são a fonte
 * de verdade das horas de manutenção. Sem número mágico: compara cobertura real.
 */
export async function getHoursByCollaborator(period: DateRange): Promise<HoursByCollaboratorData[]> {
  const [fromTimeEntries, fromOrders, ordersByKey] = await Promise.all([
    getHoursFromTimeEntries(period),
    getHoursFromServiceOrders(period),
    getOrderCountByCollaborator(period)
  ]);

  const timeEntryTotal = sumHours(fromTimeEntries);
  const orderTotal = sumHours(fromOrders);

  const rows = timeEntryTotal > 0 && timeEntryTotal >= orderTotal ? fromTimeEntries : fromOrders;

  // Anexa a contagem de ordens (sempre das OS) pela chave de nome normalizada.
  return rows
    .map((row) => ({
      ...row,
      orders: ordersByKey.get(normalizeNameKey(row.userName)) ?? 0
    }))
    .sort((a, b) => b.hours - a.hours);
}

/** Horas por colaborador a partir do apontamento dedicado (TimeEntry). */
async function getHoursFromTimeEntries(period: DateRange): Promise<HoursByCollaboratorData[]> {
  const timeEntries = await prisma.timeEntry.groupBy({
    by: ["userName"],
    where: { workDate: withinPeriod(period) },
    _sum: { hours: true },
    orderBy: { _sum: { hours: "desc" } }
  });

  return timeEntries.map((item) => ({
    userName: item.userName?.trim() || NO_RESPONSIBLE_LABEL,
    hours: Number(safeHours(item._sum.hours).toFixed(2)),
    orders: 0
  }));
}

function sumHours(rows: HoursByCollaboratorData[]): number {
  return rows.reduce((total, row) => total + row.hours, 0);
}

/**
 * Fallback: horas trabalhadas vindas das Ordens de Serviço, por responsável.
 * Exclui ordens de lubrificação (PL) — são horas de manutenção geral, não de
 * lubrificação. O módulo de Lubrificantes tem sua própria análise.
 */
async function getHoursFromServiceOrders(period: DateRange): Promise<HoursByCollaboratorData[]> {
  const orders = await prisma.serviceOrder.findMany({
    where: {
      openedAt: withinPeriod(period),
      workedHours: { gt: 0 },
      ...excludeLubricationOrderWhere()
    },
    select: { responsibleName: true, workedHours: true }
  });

  if (!orders.length) {
    return [];
  }

  const totals = new Map<string, number>();

  for (const order of orders) {
    const name = order.responsibleName?.trim() || NO_RESPONSIBLE_LABEL;
    totals.set(name, (totals.get(name) ?? 0) + safeHours(order.workedHours));
  }

  return Array.from(totals.entries())
    .map(([userName, hours]) => ({ userName, hours: Number(hours.toFixed(2)), orders: 0 }))
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Quantidade de Ordens de Serviço por colaborador (chave de nome normalizada),
 * vinda das Ordens de Serviço do período (exclui lubrificação PL). Usada para
 * enriquecer o gráfico com nº de ordens e média de horas por ordem.
 */
async function getOrderCountByCollaborator(period: DateRange): Promise<Map<string, number>> {
  const orders = await prisma.serviceOrder.findMany({
    where: {
      openedAt: withinPeriod(period),
      ...excludeLubricationOrderWhere()
    },
    select: { responsibleName: true }
  });

  const counts = new Map<string, number>();
  for (const order of orders) {
    const name = order.responsibleName?.trim() || NO_RESPONSIBLE_LABEL;
    const key = normalizeNameKey(name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

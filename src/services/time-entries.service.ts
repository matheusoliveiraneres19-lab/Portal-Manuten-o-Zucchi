/**
 * Service de Horas Apontadas — fonte única das horas por colaborador.
 *
 * Fonte primária: tabela TimeEntry (apontamento dedicado).
 * Fallback: quando não há TimeEntry no período, agrega ServiceOrder.workedHours
 * por responsável (responsibleName) — mesma base usada em Equipamentos Críticos.
 */
import { prisma } from "@/lib/prisma";
import { withinPeriod, type DateRange } from "@/utils/date-range";
import { excludeLubricationOrderWhere } from "@/utils/service-order-filters";
import type { HoursByCollaboratorData } from "@/types/dashboard";

const NO_RESPONSIBLE_LABEL = "SEM RESPONSÁVEL";

/**
 * Horas apontadas por colaborador no período.
 *
 * Fonte: TimeEntry (apontamento dedicado) QUANDO tem cobertura real — ou seja,
 * total ao menos igual às horas registradas nas Ordens de Serviço. Caso contrário
 * (ex.: TimeEntry ainda com poucos registros), as Ordens de Serviço são a fonte
 * de verdade das horas de manutenção. Sem número mágico: compara cobertura real.
 */
export async function getHoursByCollaborator(period: DateRange): Promise<HoursByCollaboratorData[]> {
  const [fromTimeEntries, fromOrders] = await Promise.all([
    getHoursFromTimeEntries(period),
    getHoursFromServiceOrders(period)
  ]);

  const timeEntryTotal = sumHours(fromTimeEntries);
  const orderTotal = sumHours(fromOrders);

  if (timeEntryTotal > 0 && timeEntryTotal >= orderTotal) {
    return fromTimeEntries;
  }
  return fromOrders;
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
    hours: Number((item._sum.hours ?? 0).toFixed(2))
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
    totals.set(name, (totals.get(name) ?? 0) + Number(order.workedHours ?? 0));
  }

  return Array.from(totals.entries())
    .map(([userName, hours]) => ({ userName, hours: Number(hours.toFixed(2)) }))
    .sort((a, b) => b.hours - a.hours);
}

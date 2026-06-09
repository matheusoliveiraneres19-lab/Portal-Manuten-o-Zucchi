/**
 * Service de Horas Apontadas — fonte única das horas por colaborador.
 *
 * Fonte primária: tabela TimeEntry (apontamento dedicado).
 * Fallback: quando não há TimeEntry no período, agrega ServiceOrder.workedHours
 * por responsável (responsibleName) — mesma base usada em Equipamentos Críticos.
 */
import { prisma } from "@/lib/prisma";
import { withinPeriod, type DateRange } from "@/utils/date-range";
import type { HoursByCollaboratorData } from "@/types/dashboard";

const NO_RESPONSIBLE_LABEL = "SEM RESPONSÁVEL";

/**
 * Horas apontadas por colaborador no período.
 * Tenta TimeEntry; se vazio, cai para ServiceOrder.workedHours por responsável.
 */
export async function getHoursByCollaborator(period: DateRange): Promise<HoursByCollaboratorData[]> {
  const timeEntries = await prisma.timeEntry.groupBy({
    by: ["userName"],
    where: { workDate: withinPeriod(period) },
    _sum: { hours: true },
    orderBy: { _sum: { hours: "desc" } }
  });

  if (timeEntries.length > 0) {
    return timeEntries.map((item) => ({
      userName: item.userName,
      hours: Number(item._sum.hours ?? 0)
    }));
  }

  return getHoursFromServiceOrders(period);
}

/** Fallback: horas trabalhadas vindas das Ordens de Serviço, por responsável. */
async function getHoursFromServiceOrders(period: DateRange): Promise<HoursByCollaboratorData[]> {
  const orders = await prisma.serviceOrder.findMany({
    where: {
      openedAt: withinPeriod(period),
      workedHours: { gt: 0 }
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

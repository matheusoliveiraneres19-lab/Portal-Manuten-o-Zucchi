/**
 * Service de Horas Apontadas — FONTE ÚNICA E OFICIAL: Ordens de Manutenção
 * (tabela ServiceOrder). As horas da equipe são a soma de `ServiceOrder.workedHours`
 * agrupada por responsável. NÃO usa mais TimeEntry (que ficava congelado num
 * snapshot importado por script); assim, toda nova importação de OS reflete
 * imediatamente nas horas.
 *
 * Regras aplicadas (compartilhadas com o portal):
 *  - EXCLUI registros de teste sem equipamento ("Equipamento não informado")
 *    via excludeInvalidTestEquipmentWhere.
 *  - INCLUI PL/PV (lubrificação e preventiva programada) por padrão — elas
 *    também consomem mão de obra real. Um filtro opcional `osType` permite
 *    restringir a Corretivas ou Preventivas (PL/PV) quando desejado.
 *  - Período filtrado por `openedAt` (data de abertura da OS) — mesma data usada
 *    em Ordens de Serviço, Equipamentos Críticos e no dashboard, garantindo que
 *    os números batam entre módulos. O schema não tem data dedicada de
 *    apontamento; `closedAt` deixaria de fora OS ainda abertas com horas lançadas.
 */
import { prisma } from "@/lib/prisma";
import { withinPeriod, type DateRange } from "@/utils/date-range";
import { excludeInvalidTestEquipmentWhere, isProgrammedPreventiveOrder } from "@/utils/service-order-classification";
import type { HoursByCollaboratorData } from "@/types/dashboard";

const NO_RESPONSIBLE_LABEL = "SEM RESPONSÁVEL";

/** Tipo de OS considerado no cálculo das horas. */
export type HoursOsType = "all" | "corrective" | "preventive";

/** Horas saneadas: ignora null/NaN/Infinity/negativos (nunca gera lixo numérico). */
function safeHours(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Horas apontadas por colaborador no período, direto das Ordens de Manutenção.
 * Cada linha traz nome do responsável, soma de horas, nº de OS e a matrícula
 * (responsibleId) para o casamento preferencial com o cadastro.
 */
export async function getHoursByCollaborator(
  period: DateRange,
  options: { osType?: HoursOsType } = {}
): Promise<HoursByCollaboratorData[]> {
  const osType = options.osType ?? "all";

  const orders = await prisma.serviceOrder.findMany({
    where: {
      openedAt: withinPeriod(period),
      ...excludeInvalidTestEquipmentWhere()
    },
    select: { responsibleName: true, responsibleId: true, workedHours: true, title: true }
  });

  const totals = new Map<string, { userName: string; hours: number; orders: number; responsibleId: string | null }>();

  for (const order of orders) {
    // Filtro opcional por tipo de OS (classificação oficial por título PL/PV).
    if (osType !== "all") {
      const preventive = isProgrammedPreventiveOrder(order);
      if (osType === "preventive" && !preventive) continue;
      if (osType === "corrective" && preventive) continue;
    }

    const userName = order.responsibleName?.trim() || NO_RESPONSIBLE_LABEL;
    const current = totals.get(userName) ?? { userName, hours: 0, orders: 0, responsibleId: null };
    current.hours += safeHours(order.workedHours);
    current.orders += 1;
    if (!current.responsibleId && order.responsibleId) {
      current.responsibleId = order.responsibleId;
    }
    totals.set(userName, current);
  }

  return Array.from(totals.values())
    .map((row) => ({
      userName: row.userName,
      hours: Number(row.hours.toFixed(2)),
      orders: row.orders,
      responsibleId: row.responsibleId
    }))
    .sort((a, b) => b.hours - a.hours);
}

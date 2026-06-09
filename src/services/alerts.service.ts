/**
 * Service de Alertas — fonte única dos indicadores de alertas do portal.
 * "Alerta crítico" = status ABERTO e severidade em CRITICAL_PRIORITIES.
 */
import { AlertStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CRITICAL_PRIORITIES } from "@/services/shared/portal-rules";
import type { CriticalAlertData } from "@/types/dashboard";

/** Quantidade de alertas críticos abertos (KPI "Alertas Críticos"). */
export async function getCriticalAlertsCount(): Promise<number> {
  return prisma.alert.count({
    where: {
      status: AlertStatus.ABERTO,
      severity: { in: CRITICAL_PRIORITIES }
    }
  });
}

/** Lista de alertas críticos abertos para o painel de alertas do dashboard. */
export async function getCriticalAlerts(limit = 5): Promise<CriticalAlertData[]> {
  const alerts = await prisma.alert.findMany({
    where: {
      status: AlertStatus.ABERTO,
      severity: { in: CRITICAL_PRIORITIES }
    },
    select: {
      title: true,
      description: true,
      severity: true,
      status: true,
      type: true,
      createdAt: true,
      equipment: { select: { name: true } }
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: limit
  });

  return alerts.map((alert) => ({
    title: alert.title,
    description: alert.description,
    equipmentName: alert.equipment?.name ?? null,
    severity: alert.severity,
    status: alert.status,
    type: alert.type,
    createdAt: alert.createdAt
  }));
}

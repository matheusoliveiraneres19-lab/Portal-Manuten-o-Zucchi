/**
 * AGREGADOR CENTRAL DO PORTAL — fonte única de verdade dos indicadores compartilhados.
 *
 * getPortalAnalytics(period) compõe, em uma única chamada (Promise.all), os
 * indicadores de OS, Compras, Lubrificantes, Materiais, Equipamentos Críticos,
 * Alertas e Horas — todos para o MESMO período. As contagens (KPIs) e as listas
 * reaproveitam exatamente as mesmas funções de service usadas pelas páginas, de
 * modo que não existe cálculo duplicado nem números que possam divergir.
 *
 * Qualquer indicador novo do portal deve passar por aqui (ver
 * docs/arquitetura-dados-portal.md).
 */
import {
  getCorrectivePreventiveChart,
  getDashboardKPIs,
  getLubricantConsumptionByPeriod,
  getOpenClosedServiceOrders,
  getTopCriticalEquipments,
  getTopMachinesBreakIndex,
  parsePeriod,
  resolveDefaultDashboardPeriod
} from "@/services/dashboard.service";
import { getCriticalAlerts } from "@/services/alerts.service";
import { getMostUsedMaterials } from "@/services/materials.service";
import { getPendingPurchases, getPurchasesByMonth } from "@/services/purchases.service";
import { getHoursByCollaborator } from "@/services/time-entries.service";
import type { DashboardPeriodInput } from "@/types/dashboard";
import type { PortalAnalytics } from "@/types/portal-analytics";

/**
 * Snapshot coerente do portal para um período. Sem período informado, usa o
 * intervalo real dos dados importados (resolveDefaultDashboardPeriod).
 */
export async function getPortalAnalytics(periodInput?: DashboardPeriodInput): Promise<PortalAnalytics> {
  const period = periodInput ? parsePeriod(periodInput) : await resolveDefaultDashboardPeriod();

  const [
    kpis,
    openClosed,
    correctivePreventive,
    pending,
    byMonth,
    consumptionByPeriod,
    mostUsed,
    topByOrders,
    topByBreakIndex,
    critical,
    hoursByCollaborator
  ] = await Promise.all([
    getDashboardKPIs(period),
    getOpenClosedServiceOrders(period),
    getCorrectivePreventiveChart(period),
    getPendingPurchases(),
    getPurchasesByMonth(period.startDate.getUTCFullYear()),
    getLubricantConsumptionByPeriod(period),
    getMostUsedMaterials(period),
    getTopCriticalEquipments(period),
    getTopMachinesBreakIndex(period),
    getCriticalAlerts(),
    getHoursByCollaborator(period)
  ]);

  return {
    period: {
      startDate: period.startDate.toISOString(),
      endDate: period.endDate.toISOString()
    },
    kpis,
    serviceOrders: {
      openClosed,
      correctivePreventive
    },
    purchases: {
      // Reaproveita a contagem já calculada nos KPIs (sem nova query).
      pendingCount: kpis.pendingPurchases,
      pending,
      byMonth
    },
    lubricants: {
      consumption: kpis.lubricantConsumption,
      consumptionByPeriod
    },
    materials: {
      mostUsedCount: kpis.mostUsedMaterials,
      mostUsed
    },
    criticalEquipments: {
      topByOrders,
      topByBreakIndex
    },
    alerts: {
      criticalCount: kpis.criticalAlerts,
      critical
    },
    timeEntries: {
      hoursByCollaborator
    },
    charts: {
      openClosedOrders: openClosed,
      correctivePreventive,
      purchasesByMonth: byMonth,
      lubricantConsumption: consumptionByPeriod,
      hoursByCollaborator,
      topBreakdownMachines: topByBreakIndex
    },
    updatedAt: new Date().toISOString()
  };
}

/**
 * Service de Compras — fonte única dos indicadores de compras do portal.
 * Regra de "compra pendente" vem de portal-rules (PENDING_PURCHASE_STATUSES).
 */
import { prisma } from "@/lib/prisma";
import { PENDING_PURCHASE_STATUSES } from "@/services/shared/portal-rules";
import { yearRange } from "@/utils/date-range";
import type { PendingPurchaseData, PurchasesByMonthData } from "@/types/dashboard";

/** Quantidade de compras pendentes (KPI "Compras Pendentes"). */
export async function getPendingPurchasesCount(): Promise<number> {
  return prisma.purchase.count({ where: { status: { in: PENDING_PURCHASE_STATUSES } } });
}

/** Lista de compras pendentes para a tabela do dashboard. */
export async function getPendingPurchases(limit = 5): Promise<PendingPurchaseData[]> {
  const purchases = await prisma.purchase.findMany({
    where: { status: { in: PENDING_PURCHASE_STATUSES } },
    select: {
      item: true,
      supplier: true,
      expectedDate: true,
      totalValue: true,
      status: true
    },
    orderBy: [{ expectedDate: "asc" }, { priority: "desc" }],
    take: limit
  });

  return purchases.map((purchase) => ({
    item: purchase.item,
    supplier: purchase.supplier,
    expectedDate: purchase.expectedDate,
    totalValue: purchase.totalValue === null ? null : Number(purchase.totalValue),
    status: purchase.status
  }));
}

/** Total de compras por mês (R$) de um ano — alimenta o gráfico "Compras por mês". */
export async function getPurchasesByMonth(year: number): Promise<PurchasesByMonthData[]> {
  const { startDate, endDate } = yearRange(year);
  const purchases = await prisma.purchase.findMany({
    where: {
      OR: [{ purchaseDate: { gte: startDate, lte: endDate } }, { requestDate: { gte: startDate, lte: endDate } }]
    },
    select: {
      purchaseDate: true,
      requestDate: true,
      totalValue: true
    }
  });
  const totals = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, value: 0 }));

  for (const purchase of purchases) {
    const referenceDate = purchase.purchaseDate ?? purchase.requestDate;

    if (referenceDate) {
      totals[referenceDate.getUTCMonth()].value += Number(purchase.totalValue ?? 0);
    }
  }

  return totals.map((item) => ({ ...item, value: Number(item.value.toFixed(2)) }));
}

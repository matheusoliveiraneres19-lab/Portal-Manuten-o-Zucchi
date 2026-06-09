/**
 * Alertas DERIVADOS dos dados do portal (TAREFA 10).
 *
 * Base para alertas automáticos calculados a partir das mesmas fontes únicas
 * (Ordens de Serviço, Compras, Lubrificantes). Por ora o service apenas DETECTA
 * e retorna candidatos a alerta — a persistência (upsert em Alert) pode ser
 * adicionada depois, no mesmo molde de lubricants.service.syncLubricantLowStockAlerts.
 *
 * Limiares configuráveis via SystemConfig (chaves abaixo); na ausência da
 * configuração, usa defaults seguros.
 */
import { AlertType, MaintenanceType, Priority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLubricantReplenishmentItems } from "@/services/lubricants.service";
import {
  BREAKDOWN_MAINTENANCE_TYPES,
  OPEN_SERVICE_ORDER_STATUSES,
  PENDING_PURCHASE_STATUSES
} from "@/services/shared/portal-rules";
import { withinPeriod, type DateRange } from "@/utils/date-range";

const CONFIG_KEYS = {
  limiteQuebrasMes: "limite_quebras_mes",
  diasOsAtrasada: "dias_os_atrasada"
} as const;

export type DerivedAlertConfig = {
  /** Nº de OS corretivas no período acima do qual o equipamento gera QUEBRA_RECORRENTE. */
  limiteQuebrasMes: number;
  /** Dias de OS aberta acima dos quais gera OS_ATRASADA. */
  diasOsAtrasada: number;
};

/** Defaults seguros usados quando SystemConfig não tem a chave (ou está indisponível). */
export const DERIVED_ALERT_DEFAULTS: DerivedAlertConfig = {
  limiteQuebrasMes: 5,
  diasOsAtrasada: 30
};

export type DerivedAlert = {
  type: AlertType;
  severity: Priority;
  title: string;
  description: string;
  equipmentId: string | null;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** Lê os limiares de SystemConfig, caindo para os defaults seguros. */
export async function getDerivedAlertConfig(): Promise<DerivedAlertConfig> {
  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: [CONFIG_KEYS.limiteQuebrasMes, CONFIG_KEYS.diasOsAtrasada] } },
      select: { key: true, value: true }
    });
    const map = new Map(rows.map((row) => [row.key, row.value]));

    return {
      limiteQuebrasMes: toPositiveInt(map.get(CONFIG_KEYS.limiteQuebrasMes), DERIVED_ALERT_DEFAULTS.limiteQuebrasMes),
      diasOsAtrasada: toPositiveInt(map.get(CONFIG_KEYS.diasOsAtrasada), DERIVED_ALERT_DEFAULTS.diasOsAtrasada)
    };
  } catch {
    return { ...DERIVED_ALERT_DEFAULTS };
  }
}

/**
 * QUEBRA_RECORRENTE — equipamentos com mais de `limiteQuebrasMes` OS corretivas
 * no período.
 */
export async function detectRecurrentBreakdowns(
  period: DateRange,
  config: DerivedAlertConfig
): Promise<DerivedAlert[]> {
  const grouped = await prisma.serviceOrder.groupBy({
    by: ["equipmentId", "equipmentName"],
    where: {
      type: { in: BREAKDOWN_MAINTENANCE_TYPES },
      openedAt: withinPeriod(period),
      equipmentId: { not: null }
    },
    _count: { _all: true }
  });

  return grouped
    .filter((item) => item._count._all > config.limiteQuebrasMes)
    .sort((a, b) => b._count._all - a._count._all)
    .map((item) => ({
      type: AlertType.QUEBRA_RECORRENTE,
      severity: Priority.ALTA,
      title: `Quebra recorrente: ${item.equipmentName ?? "equipamento sem nome"}`,
      description: `${item._count._all} ordens corretivas (${MaintenanceType.CORRETIVA}) no período, acima do limite de ${config.limiteQuebrasMes}.`,
      equipmentId: item.equipmentId
    }));
}

/**
 * OS_ATRASADA — ordens ainda em aberto há mais de `diasOsAtrasada` dias.
 */
export async function detectOverdueServiceOrders(
  config: DerivedAlertConfig,
  now: Date
): Promise<DerivedAlert[]> {
  const threshold = new Date(now.getTime() - config.diasOsAtrasada * DAY_IN_MS);
  const orders = await prisma.serviceOrder.findMany({
    where: {
      status: { in: OPEN_SERVICE_ORDER_STATUSES },
      openedAt: { lt: threshold }
    },
    select: { id: true, osNumber: true, equipmentName: true, equipmentId: true, openedAt: true },
    orderBy: { openedAt: "asc" },
    take: 50
  });

  return orders.map((order) => {
    const days = order.openedAt ? Math.floor((now.getTime() - order.openedAt.getTime()) / DAY_IN_MS) : null;

    return {
      type: AlertType.OS_ATRASADA,
      severity: Priority.MEDIA,
      title: `OS atrasada: ${order.osNumber}`,
      description: `${order.equipmentName ?? "Equipamento não informado"} — aberta há ${days ?? "?"} dias (limite ${config.diasOsAtrasada}).`,
      equipmentId: order.equipmentId
    };
  });
}

/**
 * COMPRA_ATRASADA — compras pendentes com previsão de entrega já vencida.
 */
export async function detectOverduePurchases(now: Date): Promise<DerivedAlert[]> {
  const purchases = await prisma.purchase.findMany({
    where: {
      status: { in: PENDING_PURCHASE_STATUSES },
      expectedDate: { lt: now }
    },
    select: { id: true, item: true, supplier: true, expectedDate: true, equipmentId: true },
    orderBy: { expectedDate: "asc" },
    take: 50
  });

  return purchases.map((purchase) => ({
    type: AlertType.COMPRA_ATRASADA,
    severity: Priority.ALTA,
    title: `Compra atrasada: ${purchase.item}`,
    description: `${purchase.supplier ?? "Fornecedor não informado"} — previsão vencida em ${
      purchase.expectedDate ? purchase.expectedDate.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "data não informada"
    }.`,
    equipmentId: purchase.equipmentId
  }));
}

/**
 * LUBRIFICANTE_BAIXO — reaproveita o cálculo de reposição de lubrificants.service
 * (não recalcula). A persistência já é feita por syncLubricantLowStockAlerts.
 */
export async function detectLowLubricants(): Promise<DerivedAlert[]> {
  const items = await getLubricantReplenishmentItems();

  return items.map((item) => ({
    type: AlertType.LUBRIFICANTE_BAIXO,
    severity: item.deficit >= item.minimumStock ? Priority.CRITICA : Priority.ALTA,
    title: `Lubrificante abaixo do mínimo: ${item.code}`,
    description: `${item.description} — saldo ${item.balance} ${item.unit} / mínimo ${item.minimumStock} ${item.unit} (déficit ${item.deficit}).`,
    equipmentId: null
  }));
}

/**
 * Agrega todos os candidatos a alerta derivado para um período, em paralelo.
 * Útil para um painel "alertas sugeridos" ou para futura sincronização com Alert.
 */
export async function getDerivedAlerts(period: DateRange): Promise<DerivedAlert[]> {
  const config = await getDerivedAlertConfig();
  const now = new Date();

  const [breakdowns, overdueOrders, overduePurchases, lowLubricants] = await Promise.all([
    detectRecurrentBreakdowns(period, config),
    detectOverdueServiceOrders(config, now),
    detectOverduePurchases(now),
    detectLowLubricants()
  ]);

  return [...breakdowns, ...overdueOrders, ...overduePurchases, ...lowLubricants];
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

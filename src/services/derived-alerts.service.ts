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
import { AlertType, MaintenanceType, Priority, PurchaseType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLubricantReplenishmentItems } from "@/services/lubricants.service";
import { resolvePurchaseValue } from "@/utils/purchases-normalizer";
import { BREAKDOWN_MAINTENANCE_TYPES, OPEN_SERVICE_ORDER_STATUSES } from "@/services/shared/portal-rules";
import { withinPeriod, type DateRange } from "@/utils/date-range";
import { excludeLubricationOrderWhere } from "@/utils/service-order-filters";
import { excludeInvalidTestEquipmentWhere } from "@/utils/service-order-classification";

const CONFIG_KEYS = {
  limiteQuebrasMes: "limite_quebras_mes",
  diasOsAtrasada: "dias_os_atrasada",
  diasRequisicaoSemPedido: "dias_requisicao_sem_pedido",
  valorAltoRegularizacao: "valor_alto_regularizacao"
} as const;

export type DerivedAlertConfig = {
  /** Nº de OS corretivas no período acima do qual o equipamento gera QUEBRA_RECORRENTE. */
  limiteQuebrasMes: number;
  /** Dias de OS aberta acima dos quais gera OS_ATRASADA. */
  diasOsAtrasada: number;
  /** Dias de requisição sem pedido criado acima dos quais gera alerta. */
  diasRequisicaoSemPedido: number;
  /** Valor (R$) acima do qual uma regularização Y04 gera alerta. */
  valorAltoRegularizacao: number;
};

/** Defaults seguros usados quando SystemConfig não tem a chave (ou está indisponível). */
export const DERIVED_ALERT_DEFAULTS: DerivedAlertConfig = {
  limiteQuebrasMes: 5,
  diasOsAtrasada: 30,
  diasRequisicaoSemPedido: 15,
  valorAltoRegularizacao: 5000
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
      diasOsAtrasada: toPositiveInt(map.get(CONFIG_KEYS.diasOsAtrasada), DERIVED_ALERT_DEFAULTS.diasOsAtrasada),
      diasRequisicaoSemPedido: toPositiveInt(
        map.get(CONFIG_KEYS.diasRequisicaoSemPedido),
        DERIVED_ALERT_DEFAULTS.diasRequisicaoSemPedido
      ),
      valorAltoRegularizacao: toPositiveInt(
        map.get(CONFIG_KEYS.valorAltoRegularizacao),
        DERIVED_ALERT_DEFAULTS.valorAltoRegularizacao
      )
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
      equipmentId: { not: null },
      // Quebra recorrente ignora ordens de lubrificação (prefixo PL).
      ...excludeLubricationOrderWhere()
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
      openedAt: { lt: threshold },
      ...excludeInvalidTestEquipmentWhere()
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

const DATE_PT = (date: Date | null): string =>
  date ? date.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "data não informada";

/**
 * COMPRA_ATRASADA — pedidos atrasados em aberto (previsão vencida, sem recebimento/MIGO).
 * Lê de PurchaseRecord (fonte única); itens bloqueados (ignored) ficam de fora.
 */
export async function detectOverduePurchases(): Promise<DerivedAlert[]> {
  const purchases = await prisma.purchaseRecord.findMany({
    where: { ignored: false, isLateOpen: true },
    select: { itemDescription: true, supplierName: true, expectedDeliveryDate: true, delayDays: true },
    orderBy: { delayDays: "desc" },
    take: 50
  });

  return purchases.map((purchase) => ({
    type: AlertType.COMPRA_ATRASADA,
    severity: Priority.ALTA,
    title: `Compra atrasada: ${purchase.itemDescription}`,
    description: `${purchase.supplierName ?? "Fornecedor não informado"} — previsão vencida em ${DATE_PT(
      purchase.expectedDeliveryDate
    )}${purchase.delayDays !== null ? ` (${purchase.delayDays} dias de atraso)` : ""}.`,
    equipmentId: null
  }));
}

/** COMPRA_ATRASADA — pedidos recebidos com atraso (recebimento/MIGO após a previsão). */
export async function detectLateReceivedPurchases(): Promise<DerivedAlert[]> {
  const purchases = await prisma.purchaseRecord.findMany({
    where: { ignored: false, isLateReceived: true },
    select: { itemDescription: true, supplierName: true, delayDays: true },
    orderBy: { delayDays: "desc" },
    take: 50
  });

  return purchases.map((purchase) => ({
    type: AlertType.COMPRA_ATRASADA,
    severity: Priority.MEDIA,
    title: `Recebido com atraso: ${purchase.itemDescription}`,
    description: `${purchase.supplierName ?? "Fornecedor não informado"} — entregue ${
      purchase.delayDays !== null ? `${purchase.delayDays} dias` : "dias"
    } após a previsão de entrega.`,
    equipmentId: null
  }));
}

/** COMPRA_ATRASADA — requisições sem pedido criado há mais de N dias. */
export async function detectRequisitionsWithoutOrder(config: DerivedAlertConfig, now: Date): Promise<DerivedAlert[]> {
  const threshold = new Date(now.getTime() - config.diasRequisicaoSemPedido * DAY_IN_MS);
  const requisitions = await prisma.purchaseRecord.findMany({
    where: { ignored: false, hasPurchaseOrder: false, requisitionDate: { lt: threshold } },
    select: { itemDescription: true, requisitionNumber: true, requisitionDate: true },
    orderBy: { requisitionDate: "asc" },
    take: 50
  });

  return requisitions.map((requisition) => {
    const days = requisition.requisitionDate
      ? Math.floor((now.getTime() - requisition.requisitionDate.getTime()) / DAY_IN_MS)
      : null;
    return {
      type: AlertType.COMPRA_ATRASADA,
      severity: Priority.MEDIA,
      title: `Requisição sem pedido: ${requisition.requisitionNumber ?? requisition.itemDescription}`,
      description: `${requisition.itemDescription} — requisição aberta há ${days ?? "?"} dias sem pedido de compra (limite ${config.diasRequisicaoSemPedido}).`,
      equipmentId: null
    };
  });
}

/** COMPRA_ATRASADA — pedidos recebidos pendentes de MIRO (fatura não lançada). */
export async function detectPendingMiro(): Promise<DerivedAlert[]> {
  const purchases = await prisma.purchaseRecord.findMany({
    where: { ignored: false, hasPurchaseOrder: true, isReceiptCompleted: true, hasMiro: false },
    select: { itemDescription: true, supplierName: true, purchaseOrderNumber: true },
    orderBy: { purchaseOrderDate: "asc" },
    take: 50
  });

  return purchases.map((purchase) => ({
    type: AlertType.COMPRA_ATRASADA,
    severity: Priority.MEDIA,
    title: `Pendência de MIRO: ${purchase.purchaseOrderNumber ?? purchase.itemDescription}`,
    description: `${purchase.supplierName ?? "Fornecedor não informado"} — mercadoria recebida, fatura (MIRO) ainda não lançada.`,
    equipmentId: null
  }));
}

/** COMPRA_ATRASADA — regularizações Y04 com valor acima do limite configurado. */
export async function detectHighValueRegularizations(config: DerivedAlertConfig): Promise<DerivedAlert[]> {
  const purchases = await prisma.purchaseRecord.findMany({
    where: {
      ignored: false,
      purchaseType: PurchaseType.REGULARIZACAO,
      OR: [{ netTotal: { gte: config.valorAltoRegularizacao } }, { grossTotal: { gte: config.valorAltoRegularizacao } }]
    },
    select: { itemDescription: true, supplierName: true, netTotal: true, grossTotal: true },
    take: 50
  });

  return purchases
    .map((purchase) => ({ purchase, value: resolvePurchaseValue(purchase.netTotal, purchase.grossTotal) ?? 0 }))
    .filter(({ value }) => value >= config.valorAltoRegularizacao)
    .sort((a, b) => b.value - a.value)
    .map(({ purchase, value }) => ({
      type: AlertType.COMPRA_ATRASADA,
      severity: Priority.ALTA,
      title: `Regularização de valor alto: ${purchase.itemDescription}`,
      description: `${purchase.supplierName ?? "Fornecedor não informado"} — regularização (Y04) de ${value.toLocaleString(
        "pt-BR",
        { style: "currency", currency: "BRL" }
      )}.`,
      equipmentId: null
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

  const [
    breakdowns,
    overdueOrders,
    overduePurchases,
    lateReceived,
    requisitionsWithoutOrder,
    pendingMiro,
    highValueRegularizations,
    lowLubricants
  ] = await Promise.all([
    detectRecurrentBreakdowns(period, config),
    detectOverdueServiceOrders(config, now),
    detectOverduePurchases(),
    detectLateReceivedPurchases(),
    detectRequisitionsWithoutOrder(config, now),
    detectPendingMiro(),
    detectHighValueRegularizations(config),
    detectLowLubricants()
  ]);

  return [
    ...breakdowns,
    ...overdueOrders,
    ...overduePurchases,
    ...lateReceived,
    ...requisitionsWithoutOrder,
    ...pendingMiro,
    ...highValueRegularizations,
    ...lowLubricants
  ];
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

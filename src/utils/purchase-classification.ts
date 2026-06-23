/**
 * REGRA CENTRAL de classificação de compras — FONTE ÚNICA.
 *
 * Replica as regras do painel `acompanhamento_compras_v3 (2).html` e as aplica
 * de forma idêntica no importador, nos services, nos KPIs, nas tabelas, nos
 * filtros e nos gráficos. Nenhuma página pode ter regra própria: todas derivam
 * de `classifyPurchaseRecord`.
 *
 * Precedência (igual ao HTML, com Bloqueado adicionado pelo portal):
 *   1. BLOQUEADO        (termo "bloq" em qualquer campo textual relevante)
 *   2. SERVICO          (Descr grupo Merc / texto do material indica serviço)
 *   3. REGULARIZACAO    (Grupo Comp = Y04)
 *   4. Base Y01 (não-serviço, não-Y04, não-bloqueado):
 *        - receiptDate preenchida → RECEBIDO | RECEBIDO_COM_ATRASO
 *        - sem receiptDate e sem pedido → PENDENTE_COMPRA
 *        - sem receiptDate e com pedido → EM_ATRASO (previsão vencida) | NAO_ENTREGUE
 *
 * Sem dependência de Prisma runtime/React — apenas o enum gerado (tipo) e os
 * helpers puros de `purchases-normalizer.ts`. Testável isoladamente.
 */
import { ItemNature, PurchaseOperationalStatus, PurchaseType } from "@prisma/client";
import {
  classifyItemNature,
  classifyPurchaseType,
  detectBlockedReason,
  isValidSapDocument
} from "@/utils/purchases-normalizer";

/** Natureza da compra exposta no formato da spec (Y01/Y04). */
export type PurchaseKind = "Y01_NORMAL" | "Y04_REGULARIZACAO" | "OUTROS";

/** Entrada mínima para classificar uma linha (campos já parseados/normalizados). */
export type PurchaseClassificationInput = {
  /** Grupo Comp (Y01 = normal, Y04 = regularização). */
  purchasingGroup: unknown;
  /** Descr grupo Merc — base da detecção de serviço (regra do HTML). */
  goodsGroupDescription: unknown;
  /** Texto breve material — reforça detecção de serviço (REGRA 1). */
  itemDescription: unknown;
  materialCode: unknown;
  supplierName: unknown;
  deletionCode: unknown;
  /** Pedido de Compra (vazio = requisição sem pedido). */
  purchaseOrderNumber: unknown;
  /** Data Recebimento — define "recebido" (regra do HTML, sem exigir MIRO). */
  receiptDate: Date | null;
  /** Previsão de entrega — base do atraso. */
  expectedDeliveryDate: Date | null;
};

/** Resultado canônico da classificação (consumido por import/services/UI). */
export type PurchaseClassification = {
  isService: boolean;
  isBlocked: boolean;
  purchaseKind: PurchaseKind;
  operationalStatus: PurchaseOperationalStatus;
  isLateOpen: boolean;
  isOpenNotLate: boolean;
  isReceived: boolean;
  isPendingPurchase: boolean;
  isRegularization: boolean;
  isCompletedPurchase: boolean;
};

function purchaseKindFromType(type: PurchaseType): PurchaseKind {
  if (type === PurchaseType.NORMAL) {
    return "Y01_NORMAL";
  }
  if (type === PurchaseType.REGULARIZACAO) {
    return "Y04_REGULARIZACAO";
  }
  return "OUTROS";
}

/** Início do dia (00:00 UTC) — comparação de atraso por dia-calendário, estável em qualquer fuso. */
function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Classifica uma linha de compra aplicando as regras do HTML.
 * `today` é injetado (data dinâmica) para manter a função pura/testável.
 */
export function classifyPurchaseRecord(
  input: PurchaseClassificationInput,
  today: Date
): PurchaseClassification {
  const isBlocked =
    detectBlockedReason({
      itemDescription: input.itemDescription,
      materialCode: input.materialCode,
      supplierName: input.supplierName,
      goodsGroupDescription: input.goodsGroupDescription,
      deletionCode: input.deletionCode
    }) !== null;

  const isService = classifyItemNature(input.goodsGroupDescription, input.itemDescription) === ItemNature.SERVICO;

  const purchaseType = classifyPurchaseType(input.purchasingGroup);
  const purchaseKind = purchaseKindFromType(purchaseType);
  const isRegularization = purchaseType === PurchaseType.REGULARIZACAO;

  const hasPurchaseOrder = isValidSapDocument(input.purchaseOrderNumber);
  const isReceived = input.receiptDate !== null;

  // Resolve o status canônico por precedência.
  let operationalStatus: PurchaseOperationalStatus;
  if (isBlocked) {
    operationalStatus = PurchaseOperationalStatus.BLOQUEADO;
  } else if (isService) {
    operationalStatus = PurchaseOperationalStatus.SERVICO;
  } else if (isRegularization) {
    operationalStatus = PurchaseOperationalStatus.REGULARIZACAO;
  } else if (isReceived) {
    const lateReceipt =
      input.expectedDeliveryDate !== null &&
      input.receiptDate!.getTime() > input.expectedDeliveryDate.getTime();
    operationalStatus = lateReceipt
      ? PurchaseOperationalStatus.RECEBIDO_COM_ATRASO
      : PurchaseOperationalStatus.RECEBIDO;
  } else if (!hasPurchaseOrder) {
    operationalStatus = PurchaseOperationalStatus.PENDENTE_COMPRA;
  } else if (
    input.expectedDeliveryDate !== null &&
    startOfDay(input.expectedDeliveryDate).getTime() < startOfDay(today).getTime()
  ) {
    operationalStatus = PurchaseOperationalStatus.EM_ATRASO;
  } else {
    operationalStatus = PurchaseOperationalStatus.NAO_ENTREGUE;
  }

  return {
    isService,
    isBlocked,
    purchaseKind,
    operationalStatus,
    isLateOpen: operationalStatus === PurchaseOperationalStatus.EM_ATRASO,
    isOpenNotLate: operationalStatus === PurchaseOperationalStatus.NAO_ENTREGUE,
    isReceived,
    isPendingPurchase: operationalStatus === PurchaseOperationalStatus.PENDENTE_COMPRA,
    isRegularization,
    isCompletedPurchase: isReceived
  };
}

/**
 * Deriva o status operacional a partir de flags JÁ calculadas (colunas do banco)
 * + a data atual. Usada em tempo de LEITURA para que a fronteira
 * EM_ATRASO/NAO_ENTREGUE acompanhe o dia de hoje (REGRA 10), sem depender do
 * valor congelado na importação. Mantém a MESMA precedência de classifyPurchaseRecord.
 */
export function resolveOperationalStatusFromFlags(
  input: {
    isBlocked: boolean;
    isService: boolean;
    purchaseType: PurchaseType;
    hasPurchaseOrder: boolean;
    receiptDate: Date | null;
    expectedDeliveryDate: Date | null;
    /** Recebido após a previsão (estável; independe de hoje). */
    isLateReceived: boolean;
  },
  today: Date
): PurchaseOperationalStatus {
  if (input.isBlocked) return PurchaseOperationalStatus.BLOQUEADO;
  if (input.isService) return PurchaseOperationalStatus.SERVICO;
  if (input.purchaseType === PurchaseType.REGULARIZACAO) return PurchaseOperationalStatus.REGULARIZACAO;
  if (input.receiptDate !== null) {
    return input.isLateReceived ? PurchaseOperationalStatus.RECEBIDO_COM_ATRASO : PurchaseOperationalStatus.RECEBIDO;
  }
  if (!input.hasPurchaseOrder) return PurchaseOperationalStatus.PENDENTE_COMPRA;
  if (input.expectedDeliveryDate !== null && startOfDay(input.expectedDeliveryDate).getTime() < startOfDay(today).getTime()) {
    return PurchaseOperationalStatus.EM_ATRASO;
  }
  return PurchaseOperationalStatus.NAO_ENTREGUE;
}

/* ------------------------------------------------------------------ */
/* Rótulos e cores do status operacional (UI premium)                 */
/* ------------------------------------------------------------------ */

export const PURCHASE_OPERATIONAL_STATUS_LABELS: Record<PurchaseOperationalStatus, string> = {
  RECEBIDO: "Recebido",
  RECEBIDO_COM_ATRASO: "Recebido com atraso",
  PENDENTE_COMPRA: "Pendente de compra",
  EM_ATRASO: "Em atraso",
  NAO_ENTREGUE: "Não entregue / dentro do prazo",
  SERVICO: "Serviço",
  REGULARIZACAO: "Regularização Y04",
  BLOQUEADO: "Bloqueado",
  INDEFINIDO: "Indefinido"
};

/** Ordem estável dos status para filtros/cards/legendas. */
export const PURCHASE_OPERATIONAL_STATUS_ORDER: PurchaseOperationalStatus[] = [
  PurchaseOperationalStatus.EM_ATRASO,
  PurchaseOperationalStatus.PENDENTE_COMPRA,
  PurchaseOperationalStatus.NAO_ENTREGUE,
  PurchaseOperationalStatus.RECEBIDO,
  PurchaseOperationalStatus.RECEBIDO_COM_ATRASO,
  PurchaseOperationalStatus.REGULARIZACAO,
  PurchaseOperationalStatus.SERVICO,
  PurchaseOperationalStatus.BLOQUEADO,
  PurchaseOperationalStatus.INDEFINIDO
];

export const PURCHASE_KIND_LABELS: Record<PurchaseKind, string> = {
  Y01_NORMAL: "Compra normal (Y01)",
  Y04_REGULARIZACAO: "Regularização (Y04)",
  OUTROS: "Outros"
};

/** Rótulos do filtro "Tipo" (REGRA 14). */
export const PURCHASE_KIND_FILTER_LABELS: Record<string, string> = {
  material: "Material",
  servico: "Serviço",
  regularizacao: "Regularização (Y04)",
  bloqueado: "Bloqueado"
};

/** Campos de data filtráveis (REGRA 14) e seus rótulos. */
export const PURCHASE_DATE_FIELD_LABELS: Record<string, string> = {
  purchaseOrderDate: "Data do pedido",
  expectedDeliveryDate: "Previsão de entrega",
  receiptDate: "Data de recebimento",
  requisitionDate: "Data da requisição"
};

/** Cores por status (REGRA 13) — alinhadas à paleta do HTML/portal. */
export const PURCHASE_OPERATIONAL_STATUS_COLORS: Record<PurchaseOperationalStatus, string> = {
  EM_ATRASO: "#f87171",
  PENDENTE_COMPRA: "#fbbf24",
  NAO_ENTREGUE: "#818cf8",
  RECEBIDO: "#4ade80",
  RECEBIDO_COM_ATRASO: "#fb923c",
  REGULARIZACAO: "#c084fc",
  SERVICO: "#64748b",
  BLOQUEADO: "#475569",
  INDEFINIDO: "#94a3b8"
};

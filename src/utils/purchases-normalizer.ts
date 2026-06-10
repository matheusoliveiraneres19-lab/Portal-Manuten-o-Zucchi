/**
 * Funções puras de normalização e classificação da planilha de Compras (SAP/Fiori).
 * Sem dependência de Prisma ou React — testáveis isoladamente.
 *
 * Concentra TODAS as regras de negócio de compras (pedido criado, MIGO/MIRO,
 * recebimento, atrasos, Y01/Y04, material/serviço, bloqueados). Os services e o
 * importador apenas consomem estas funções — fonte única das regras.
 */
import { ItemNature, PurchaseType } from "@prisma/client";
import { converterDataExcel, converterNumeroBrasileiro, limparTexto } from "@/utils/importacao";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** Reaproveita o parser de número brasileiro ("1.234,56", number, "R$ ..."). */
export function parsePurchaseNumber(value: unknown): number | null {
  return converterNumeroBrasileiro(value);
}

/** Reaproveita o conversor de datas (serial Excel, dd/mm/aaaa, ISO). */
export function parsePurchaseDate(value: unknown): Date | null {
  return converterDataExcel(value);
}

/** Texto limpo ou null quando vazio. */
export function optionalText(value: unknown): string | null {
  const text = limparTexto(value);
  return text || null;
}

/**
 * Documento SAP "válido": texto não vazio, com ao menos um dígito e que não seja
 * apenas zeros. Cobre "Pedido de Compra", "MIGO" e "MIRO" — quando vazio, "0",
 * "-" ou sem número, considera-se ausente.
 */
export function isValidSapDocument(value: unknown): boolean {
  const text = limparTexto(value);
  if (!text) {
    return false;
  }
  const digits = text.replace(/\D/g, "");
  if (!digits) {
    return false;
  }
  return Number(digits) > 0;
}

/** Marca de recebimento concluído ("X"). */
export function isReceiptFlagSet(value: unknown): boolean {
  return limparTexto(value).toUpperCase() === "X";
}

/* ------------------------------------------------------------------ */
/* Classificação de natureza da compra (Grupo Comp) e do item         */
/* ------------------------------------------------------------------ */

/** Y04 = Regularização, Y01 = Compra normal, demais = OUTROS. */
export function classifyPurchaseType(purchasingGroup: unknown): PurchaseType {
  const code = limparTexto(purchasingGroup).toUpperCase();
  if (code.includes("Y04")) {
    return PurchaseType.REGULARIZACAO;
  }
  if (code.includes("Y01")) {
    return PurchaseType.NORMAL;
  }
  return PurchaseType.OUTROS;
}

const SERVICE_KEYWORDS = [
  "prest",
  "serv",
  "servico",
  "serviço",
  "servicos",
  "serviços",
  "locacao",
  "locação",
  "montagem",
  "mao de obra",
  "mão de obra"
];

/** SERVICO quando a categoria ou o texto do pedido indicam serviço/locação/mão de obra. */
export function classifyItemNature(goodsGroupDescription: unknown, itemDescription: unknown): ItemNature {
  const category = normalizeLoose(goodsGroupDescription);
  if (category.includes("servico")) {
    return ItemNature.SERVICO;
  }
  const description = normalizeLoose(itemDescription);
  const hit = SERVICE_KEYWORDS.some((keyword) => description.includes(normalizeLoose(keyword)));
  return hit ? ItemNature.SERVICO : ItemNature.MATERIAL;
}

/* ------------------------------------------------------------------ */
/* Itens bloqueados / ignorados                                       */
/* ------------------------------------------------------------------ */

/**
 * Detecta itens bloqueados de forma case-insensitive em qualquer campo textual
 * relevante. Retorna a razão (campo + termo) quando bloqueado, ou null.
 */
export function detectBlockedReason(fields: {
  itemDescription?: unknown;
  materialCode?: unknown;
  supplierName?: unknown;
  goodsGroupDescription?: unknown;
  deletionCode?: unknown;
}): string | null {
  const candidates: Array<[string, unknown]> = [
    ["Texto Breve do Pedido", fields.itemDescription],
    ["Material", fields.materialCode],
    ["Descrição Fornecedor", fields.supplierName],
    ["Descr grupo Merc", fields.goodsGroupDescription],
    ["Código de eliminação", fields.deletionCode]
  ];

  for (const [campo, value] of candidates) {
    const text = limparTexto(value);
    if (text && /bloq/i.test(text)) {
      return `${campo}: "${text}"`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Status do processo (MIGO / MIRO / recebimento / atrasos)           */
/* ------------------------------------------------------------------ */

export type PurchaseStatusInput = {
  purchaseOrderNumber: unknown;
  migoNumber: unknown;
  migoDate: Date | null;
  miroNumber: unknown;
  miroDate: Date | null;
  receiptFlag: unknown;
  receiptDate: Date | null;
  expectedDeliveryDate: Date | null;
};

export type PurchaseStatusFlags = {
  hasPurchaseOrder: boolean;
  hasMigo: boolean;
  hasMiro: boolean;
  isReceiptCompleted: boolean;
  isLateOpen: boolean;
  isLateReceived: boolean;
  delayDays: number | null;
};

/** Aplica as regras 1–6 de negócio para derivar os flags de status. */
export function computeStatusFlags(input: PurchaseStatusInput, now: Date): PurchaseStatusFlags {
  const hasPurchaseOrder = isValidSapDocument(input.purchaseOrderNumber);
  const hasMigo = isValidSapDocument(input.migoNumber) || input.migoDate !== null;
  const hasMiro = isValidSapDocument(input.miroNumber) || input.miroDate !== null;

  const isReceiptCompleted =
    isReceiptFlagSet(input.receiptFlag) || input.receiptDate !== null || hasMigo;

  // Data efetiva de recebimento (recebimento físico ou MIGO).
  const effectiveReceiptDate = input.receiptDate ?? input.migoDate ?? null;

  let isLateOpen = false;
  let isLateReceived = false;
  let delayDays: number | null = null;

  if (input.expectedDeliveryDate) {
    if (effectiveReceiptDate) {
      // Recebido: atraso quando recebeu depois da previsão.
      if (effectiveReceiptDate.getTime() > input.expectedDeliveryDate.getTime()) {
        isLateReceived = true;
        delayDays = diffDays(input.expectedDeliveryDate, effectiveReceiptDate);
      }
    } else if (!isReceiptCompleted && input.expectedDeliveryDate.getTime() < now.getTime()) {
      // Em aberto: previsão vencida e ainda sem recebimento/MIGO.
      isLateOpen = true;
      delayDays = diffDays(input.expectedDeliveryDate, now);
    }
  }

  return { hasPurchaseOrder, hasMigo, hasMiro, isReceiptCompleted, isLateOpen, isLateReceived, delayDays };
}

/* ------------------------------------------------------------------ */
/* Tempos do processo (TAREFA 7)                                      */
/* ------------------------------------------------------------------ */

export type ProcessTimeInput = {
  requisitionDate: Date | null;
  purchaseOrderDate: Date | null;
  receiptDate: Date | null;
  migoDate: Date | null;
  miroDate: Date | null;
};

export type ProcessTimes = {
  requisitionToOrderDays: number | null;
  orderToReceiptDays: number | null;
  migoToMiroDays: number | null;
  totalProcessDays: number | null;
};

export function computeProcessTimes(input: ProcessTimeInput): ProcessTimes {
  const receipt = input.receiptDate ?? input.migoDate ?? null;
  const processEnd = input.miroDate ?? input.receiptDate ?? input.migoDate ?? null;

  return {
    requisitionToOrderDays: nonNegativeDiff(input.requisitionDate, input.purchaseOrderDate),
    orderToReceiptDays: nonNegativeDiff(input.purchaseOrderDate, receipt),
    migoToMiroDays: nonNegativeDiff(input.migoDate, input.miroDate),
    totalProcessDays: nonNegativeDiff(input.requisitionDate, processEnd)
  };
}

/* ------------------------------------------------------------------ */
/* Valor da compra (TAREFA 10)                                        */
/* ------------------------------------------------------------------ */

/**
 * Data de referência do registro para análises mensais/anuais.
 * Prioridade: Data do Pedido → Data da Requisição → Previsão de Entrega.
 * Garante que registros sem pedido (só requisição) ainda apareçam nos gráficos.
 */
export function getPurchaseRecordReferenceDate(record: {
  purchaseOrderDate?: Date | null;
  requisitionDate?: Date | null;
  expectedDeliveryDate?: Date | null;
}): Date | null {
  return record.purchaseOrderDate ?? record.requisitionDate ?? record.expectedDeliveryDate ?? null;
}

/** Valor preferencial: Total líquido; se vazio ou zero, cai para Total bruto. */
export function resolvePurchaseValue(netTotal: number | null, grossTotal: number | null): number | null {
  if (netTotal !== null && netTotal !== 0) {
    return netTotal;
  }
  if (grossTotal !== null) {
    return grossTotal;
  }
  return netTotal;
}

/* ------------------------------------------------------------------ */
/* Chave técnica de deduplicação                                      */
/* ------------------------------------------------------------------ */

/** requisição + pedido + material + descrição + quantidade + total líquido. */
export function buildPurchaseTechnicalKey(parts: {
  requisitionNumber: string | null;
  purchaseOrderNumber: string | null;
  materialCode: string | null;
  itemDescription: string;
  quantity: number | null;
  netTotal: number | null;
}): string {
  return [
    parts.requisitionNumber ?? "",
    parts.purchaseOrderNumber ?? "",
    parts.materialCode ?? "",
    parts.itemDescription,
    parts.quantity ?? "",
    parts.netTotal ?? ""
  ].join("|");
}

/* ------------------------------------------------------------------ */
/* Rótulos                                                            */
/* ------------------------------------------------------------------ */

export const PURCHASE_TYPE_LABELS: Record<PurchaseType, string> = {
  NORMAL: "Compra normal (Y01)",
  REGULARIZACAO: "Regularização (Y04)",
  OUTROS: "Outros"
};

export const ITEM_NATURE_LABELS: Record<ItemNature, string> = {
  MATERIAL: "Material",
  SERVICO: "Serviço"
};

/** Opções do filtro de status operacional (multi-seleção). value estável p/ URL. */
export const PURCHASE_OPERATIONAL_STATUSES: Array<{ value: string; label: string }> = [
  { value: "sem-pedido", label: "Sem pedido criado" },
  { value: "com-pedido", label: "Com pedido criado" },
  { value: "pendente-migo", label: "Pendente de MIGO" },
  { value: "com-migo", label: "Com MIGO" },
  { value: "pendente-miro", label: "Pendente de MIRO" },
  { value: "com-miro", label: "Com MIRO" },
  { value: "atrasado-aberto", label: "Atrasado em aberto" },
  { value: "recebido-atraso", label: "Recebido com atraso" },
  { value: "recebimento-concluido", label: "Recebimento concluído" },
  { value: "y04", label: "Regularização (Y04)" },
  { value: "y01", label: "Compra normal (Y01)" },
  { value: "servico", label: "Serviço" },
  { value: "material", label: "Material" }
];

export const PURCHASE_OPERATIONAL_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  PURCHASE_OPERATIONAL_STATUSES.map((status) => [status.value, status.label])
);

/** Campos de data filtráveis e seus rótulos. */
export const PURCHASE_DATE_FIELD_LABELS: Record<string, string> = {
  requisitionDate: "Data da requisição",
  purchaseOrderDate: "Data do pedido",
  expectedDeliveryDate: "Previsão de entrega",
  receiptDate: "Data de recebimento",
  migoDate: "Data MIGO",
  miroDate: "Data MIRO"
};

/** Rótulo de status legível para a tabela (pendentes e realizadas). */
export function purchaseStatusLabel(flags: {
  hasPurchaseOrder: boolean;
  hasMigo: boolean;
  hasMiro: boolean;
  isReceiptCompleted: boolean;
  isLateOpen: boolean;
  isLateReceived: boolean;
}): string {
  if (!flags.hasPurchaseOrder) {
    return "Sem pedido";
  }
  if (flags.isLateOpen) {
    return "Atrasado";
  }
  if (flags.hasMiro) {
    return "MIRO lançada";
  }
  if (flags.isReceiptCompleted || flags.hasMigo) {
    return flags.isLateReceived ? "Recebido com atraso" : "Recebido";
  }
  return "Pedido em aberto";
}

/* ------------------------------------------------------------------ */
/* Helpers internos                                                   */
/* ------------------------------------------------------------------ */

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_IN_MS);
}

/** Diferença em dias, ou null quando alguma data falta. Pode ser negativa. */
function nonNegativeDiff(from: Date | null, to: Date | null): number | null {
  if (!from || !to) {
    return null;
  }
  const days = diffDays(from, to);
  return days >= 0 ? days : null;
}

function normalizeLoose(value: unknown): string {
  return limparTexto(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

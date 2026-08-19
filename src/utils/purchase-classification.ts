/**
 * REGRAS CENTRAIS de classificação de compras — FONTE ÚNICA.
 *
 * O módulo expõe DOIS modos, e nenhuma tela pode ter regra própria:
 *
 * 1. `classifyPurchaseV31HtmlRule(record, today)` — REGRA OFICIAL v3.1,
 *    idêntica ao painel `acompanhamento_compras_v3.1.html`. É a regra da aba
 *    **Compras Pendentes**. Não conhece "Ignorados", não exclui por fornecedor,
 *    Bloq/Frete ou CódElim, e identifica serviço pelo TEXTO de `Descr grupo Merc`.
 *
 * 2. `classifyPurchaseRecord(record, today)` — modo `regraPortalGerencial`
 *    (alias `classifyPurchaseRegraPortalGerencial`), com as exclusões
 *    operacionais do portal. Continua servindo Compras Realizadas, os KPIs
 *    gerenciais e a auditoria de itens fora do relatório.
 *
 * PRECEDÊNCIA do modo gerencial (TAREFA 3):
 *   1. CódElim = "L"                       → IGNORADO
 *   2. Descrição contém Bloqueado/Frete    → IGNORADO
 *   3. Fornecedor eliminado                → IGNORADO
 *   4. Grupo Merc = Y0008                  → SERVICO      (Y0008_SERVICO)
 *   5. Grupo Comp = Y04                    → REGULARIZACAO(Y04_REGULARIZACAO)
 *   6. Demais (Y01/normal)                 → funil de status
 *   7. Status do funil: ENTREGUE → ATRASADO → COMPRADO → PENDENTE_COMPRA
 *
 * Sem dependência de Prisma runtime/React — só o enum gerado (tipo) e helpers
 * puros de `purchases-normalizer.ts`. Testável isoladamente.
 */
import { PurchaseOperationalStatus, PurchaseType } from "@prisma/client";
import { CHART_SERIES, SEMANTIC } from "@/constants/theme";
import {
  classifyPurchaseType,
  detectIgnoredDescriptionTerm,
  hasSpreadsheetValue,
  isDeletionExcludedCode,
  isEliminatedSupplierName,
  isRegularizationByGroup,
  isRegularizationGroupExact,
  isMarkedX,
  isServiceByGoodsGroup,
  isServiceByGoodsGroupDescription,
  isValidSapDocument
} from "@/utils/purchases-normalizer";

/** Natureza fiscal/operacional da compra (TAREFA 1). */
export type PurchaseNature = "Y01_COMPRA_NORMAL" | "Y04_REGULARIZACAO" | "Y0008_SERVICO" | "IGNORADO";

/** Agrupamento de relatório (qual página lista o registro na tabela). */
export type PurchaseReportGroup =
  | "COMPRAS_PENDENTES"
  | "COMPRAS_REALIZADAS"
  | "REGULARIZACOES"
  | "SERVICOS"
  | "IGNORADOS";

/** Natureza no formato Y01/Y04 (compat. com filtros/tabelas existentes). */
export type PurchaseKind = "Y01_NORMAL" | "Y04_REGULARIZACAO" | "OUTROS";

const OS = PurchaseOperationalStatus;

/** Entrada mínima para classificar uma linha (campos já parseados/normalizados). */
export type PurchaseClassificationInput = {
  /** Grupo Comp (Y01 = normal, Y04 = regularização). */
  purchasingGroup: unknown;
  /** Grupo Merc (código) — base da detecção de serviço Y0008. */
  goodsGroupCode: unknown;
  /** Descr grupo Merc — reforça serviço/frete. */
  goodsGroupDescription: unknown;
  /** Texto breve do pedido / descrição do material — base de bloqueado/frete. */
  itemDescription: unknown;
  /** Descrição/denominação adicional do material (se houver). */
  materialDescription?: unknown;
  materialCode: unknown;
  supplierCode: unknown;
  supplierName: unknown;
  /** CódElim. */
  deletionCode: unknown;
  /** Pedido de Compra (vazio = requisição sem pedido). */
  purchaseOrderNumber: unknown;
  /** Recbconcl — recebimento concluído ("X"). */
  receiptFlag: unknown;
  /** Data Recebimento — recebimento lançado. */
  receiptDate: Date | null;
  /** Previsão de entrega — base do atraso. */
  expectedDeliveryDate: Date | null;
};

/** Resultado canônico da classificação (TAREFA 1 + auditoria TAREFA 17). */
export type PurchaseClassification = {
  isIgnored: boolean;
  ignoreReason: string | null;
  purchaseNature: PurchaseNature;
  operationalStatus: PurchaseOperationalStatus;
  reportGroup: PurchaseReportGroup;
  /** Frase de auditoria: por que entrou/saiu do KPI. */
  classificationReason: string;
  /* Flags derivadas (persistidas para recomputar em leitura e alimentar KPIs). */
  purchaseType: PurchaseType;
  purchaseKind: PurchaseKind;
  isService: boolean;
  isRegularization: boolean;
  isBlocked: boolean;
  isFreight: boolean;
  isEliminatedSupplier: boolean;
  isDeletionExcluded: boolean;
  hasPurchaseOrder: boolean;
  /** Recbconcl = "X". */
  isReceiptConfirmed: boolean;
  /** Entregue = recebimento lançado + Recbconcl "X". */
  isDelivered: boolean;
  /** Entregue após a previsão (relatório separado "entregue com atraso"). */
  isLateReceived: boolean;
};

function purchaseKindFromType(type: PurchaseType): PurchaseKind {
  if (type === PurchaseType.NORMAL) return "Y01_NORMAL";
  if (type === PurchaseType.REGULARIZACAO) return "Y04_REGULARIZACAO";
  return "OUTROS";
}

/** Início do dia (00:00 UTC) — comparação de atraso por dia-calendário. */
function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/* ================================================================== */
/* REGRA OFICIAL v3.1 — idêntica ao acompanhamento_compras_v3.1.html   */
/* ================================================================== */

/**
 * Os SEIS grupos da regra v3.1. São mutuamente exclusivos e cobrem 100% das
 * linhas lidas — não existe categoria "Ignorados" neste modo.
 *
 * Equivalência com o HTML:
 *   SERVICOS        ← `servicos = raw.filter(ehServ)`
 *   REGULARIZACAO   ← `y04      = raw.filter(!ehServ && ehY04)`
 *   RECEBIDOS       ← `recebidos = ana.filter(!!Data Recebimento)`
 *   PENDENTE_COMPRA ← `semPed   = ana.filter(!Pedido de Compra && !Data Recebimento)`
 *   EM_ATRASO       ← `comPed.filter(Previsão && Previsão < hoje)`
 *   NAO_ENTREGUES   ← `comPed.filter(!Previsão || Previsão >= hoje)`
 * onde `ana = raw.filter(!ehServ && !ehY04)`.
 */
export type PurchaseV31Group =
  | "SERVICOS"
  | "REGULARIZACAO"
  | "RECEBIDOS"
  | "PENDENTE_COMPRA"
  | "EM_ATRASO"
  | "NAO_ENTREGUES";

/**
 * Colunas do HTML de que a regra v3.1 depende. São só CINCO — qualquer outro
 * campo (CódElim, Recbconcl, fornecedor, MIGO/MIRO, valores) é irrelevante aqui,
 * e é justamente essa a diferença para a regra gerencial.
 */
export type PurchaseV31Input = {
  /** Descr grupo Merc — único critério de serviço. */
  goodsGroupDescription: unknown;
  /** Grupo Comp — "Y04" exato = regularização. */
  purchasingGroup: unknown;
  /** Pedido de Compra — vazio = ainda pendente de compra. */
  purchaseOrderNumber: unknown;
  /** Data Recebimento — preenchida = recebido. */
  receiptDate: unknown;
  /** Previsão de entrega, já convertida em data (ou null quando ausente/inválida). */
  expectedDeliveryDate: Date | null;
};

export type PurchaseV31Classification = {
  group: PurchaseV31Group;
  isService: boolean;
  isRegularization: boolean;
  /** Está na base de análise: não é serviço e não é Y04. */
  inAnalysisBase: boolean;
  hasPurchaseOrder: boolean;
  hasReceipt: boolean;
  /** Previsão de entrega vencida (só faz sentido dentro de `comPed`). */
  isOverdue: boolean;
  /** Frase de auditoria: por que a linha caiu neste grupo. */
  reason: string;
};

export const PURCHASE_V31_GROUP_LABELS: Record<PurchaseV31Group, string> = {
  SERVICOS: "Serviços",
  REGULARIZACAO: "Regularização Y04",
  RECEBIDOS: "Recebidos",
  PENDENTE_COMPRA: "Pendente de Compra",
  EM_ATRASO: "Em Atraso",
  NAO_ENTREGUES: "Não Entregues"
};

/**
 * Classifica uma linha pela REGRA OFICIAL v3.1 do HTML.
 *
 * A ORDEM é obrigatória e é a mesma do arquivo original:
 *   1. Serviço (`Descr grupo Merc` contém "servi")  → sai da base
 *   2. Regularização (não-serviço e `Grupo Comp` = "Y04") → sai da base
 *   3. Base de análise (nem serviço, nem Y04), e dentro dela:
 *      3.1 Data Recebimento preenchida                        → RECEBIDOS
 *      3.2 sem Pedido de Compra e sem Data Recebimento        → PENDENTE_COMPRA
 *      3.3 com Pedido, sem recebimento e previsão vencida     → EM_ATRASO
 *      3.4 com Pedido, sem recebimento, sem previsão ou futura→ NAO_ENTREGUES
 *
 * O que esta regra deliberadamente NÃO faz (por não existir no HTML): excluir
 * por CódElim "L", por fornecedor eliminado, por Bloq/Frete, tratar Y0008 como
 * serviço, exigir `Requisição` preenchida ou produzir "Ignorados".
 *
 * `today` é injetado (nunca lido de `new Date()` aqui dentro) para manter a
 * função pura e reproduzível nos testes.
 */
export function classifyPurchaseV31HtmlRule(
  input: PurchaseV31Input,
  today: Date
): PurchaseV31Classification {
  const isService = isServiceByGoodsGroupDescription(input.goodsGroupDescription);
  const isRegularization = !isService && isRegularizationGroupExact(input.purchasingGroup);
  const inAnalysisBase = !isService && !isRegularization;

  const hasPurchaseOrder = hasSpreadsheetValue(input.purchaseOrderNumber);
  const hasReceipt = hasSpreadsheetValue(input.receiptDate);
  // `hoje` com hora zerada, como no HTML (`hoje.setHours(0,0,0,0)`): a previsão
  // que cai HOJE ainda não está atrasada.
  const isOverdue =
    input.expectedDeliveryDate !== null &&
    startOfDay(input.expectedDeliveryDate).getTime() < startOfDay(today).getTime();

  const base = { isService, isRegularization, inAnalysisBase, hasPurchaseOrder, hasReceipt, isOverdue };

  if (isService) {
    return { ...base, group: "SERVICOS", reason: 'Serviço: "Descr grupo Merc" contém "servi"' };
  }
  if (isRegularization) {
    return { ...base, group: "REGULARIZACAO", reason: 'Regularização: não é serviço e "Grupo Comp" = Y04' };
  }
  if (hasReceipt) {
    return { ...base, group: "RECEBIDOS", reason: "Recebido: base de análise com Data Recebimento preenchida" };
  }
  if (!hasPurchaseOrder) {
    return {
      ...base,
      group: "PENDENTE_COMPRA",
      reason: "Pendente de Compra: base de análise sem Pedido de Compra e sem Data Recebimento"
    };
  }
  if (isOverdue) {
    return { ...base, group: "EM_ATRASO", reason: "Em Atraso: com pedido, sem recebimento e previsão vencida" };
  }
  return {
    ...base,
    group: "NAO_ENTREGUES",
    reason: "Não Entregue: com pedido, sem recebimento e previsão vazia ou futura"
  };
}

/** Auditoria da regra v3.1 (TAREFA 16) — os mesmos totais que o HTML imprime. */
export type PurchaseV31Audit = {
  totalLido: number;
  servicosExcluidos: number;
  regularizacaoY04: number;
  baseAnalise: number;
  recebidos: number;
  pendenteCompra: number;
  emAtraso: number;
  naoEntregues: number;
};

export function emptyPurchaseV31Audit(): PurchaseV31Audit {
  return {
    totalLido: 0,
    servicosExcluidos: 0,
    regularizacaoY04: 0,
    baseAnalise: 0,
    recebidos: 0,
    pendenteCompra: 0,
    emAtraso: 0,
    naoEntregues: 0
  };
}

/** Soma uma linha já classificada na auditoria (muta e devolve o acumulador). */
export function accumulatePurchaseV31Audit(audit: PurchaseV31Audit, group: PurchaseV31Group): PurchaseV31Audit {
  audit.totalLido += 1;
  switch (group) {
    case "SERVICOS":
      audit.servicosExcluidos += 1;
      break;
    case "REGULARIZACAO":
      audit.regularizacaoY04 += 1;
      break;
    case "RECEBIDOS":
      audit.baseAnalise += 1;
      audit.recebidos += 1;
      break;
    case "PENDENTE_COMPRA":
      audit.baseAnalise += 1;
      audit.pendenteCompra += 1;
      break;
    case "EM_ATRASO":
      audit.baseAnalise += 1;
      audit.emAtraso += 1;
      break;
    case "NAO_ENTREGUES":
      audit.baseAnalise += 1;
      audit.naoEntregues += 1;
      break;
  }
  return audit;
}

/** Classifica uma coleção inteira e devolve a auditoria da TAREFA 16. */
export function summarizePurchaseV31<T>(
  records: readonly T[],
  toInput: (record: T) => PurchaseV31Input,
  today: Date
): PurchaseV31Audit {
  const audit = emptyPurchaseV31Audit();
  for (const record of records) {
    accumulatePurchaseV31Audit(audit, classifyPurchaseV31HtmlRule(toInput(record), today).group);
  }
  return audit;
}

/**
 * Status operacional equivalente a cada grupo v3.1 — usado só para reaproveitar
 * o badge/rotulagem existente na tabela. A REGRA continua sendo a v3.1; este
 * mapa não reintroduz o funil gerencial.
 */
export function operationalStatusForV31Group(group: PurchaseV31Group): PurchaseOperationalStatus {
  switch (group) {
    case "SERVICOS":
      return OS.SERVICO;
    case "REGULARIZACAO":
      return OS.REGULARIZACAO;
    case "RECEBIDOS":
      return OS.ENTREGUE;
    case "EM_ATRASO":
      return OS.ATRASADO;
    case "NAO_ENTREGUES":
      return OS.COMPRADO;
    default:
      return OS.PENDENTE_COMPRA;
  }
}

/** Mapa status → grupo de relatório. */
export function reportGroupFor(status: PurchaseOperationalStatus): PurchaseReportGroup {
  switch (status) {
    case OS.PENDENTE_COMPRA:
    case OS.ATRASADO:
      return "COMPRAS_PENDENTES";
    case OS.COMPRADO:
    case OS.ENTREGUE:
      return "COMPRAS_REALIZADAS";
    case OS.REGULARIZACAO:
      return "REGULARIZACOES";
    case OS.SERVICO:
      return "SERVICOS";
    default:
      return "IGNORADOS";
  }
}

/** Frase de auditoria (TAREFA 17) a partir do status + motivo de exclusão. */
export function classificationReasonFor(status: PurchaseOperationalStatus, ignoreReason?: string | null): string {
  switch (status) {
    case OS.IGNORADO:
      return `Excluído: ${ignoreReason ?? "ignorado"}`;
    case OS.SERVICO:
      return "Separado: Grupo Merc Y0008 - Serviço";
    case OS.REGULARIZACAO:
      return "Separado: Grupo Comp Y04 - Regularização";
    case OS.ENTREGUE:
      return "Incluído: entregue (recebimento + Recbconcl X)";
    case OS.ATRASADO:
      return "Incluído: Y01 com previsão vencida e sem recebimento";
    case OS.COMPRADO:
      return "Incluído: Y01 com pedido de compra";
    case OS.PENDENTE_COMPRA:
      return "Incluído: Y01 sem pedido vinculado";
    default:
      return "";
  }
}

export function reportGroupLabel(group: PurchaseReportGroup): string {
  switch (group) {
    case "COMPRAS_PENDENTES":
      return "Compras pendentes";
    case "COMPRAS_REALIZADAS":
      return "Compras realizadas";
    case "REGULARIZACOES":
      return "Regularizações";
    case "SERVICOS":
      return "Serviços";
    default:
      return "Ignorados";
  }
}

function natureForStatus(status: PurchaseOperationalStatus): PurchaseNature {
  if (status === OS.IGNORADO) return "IGNORADO";
  if (status === OS.SERVICO) return "Y0008_SERVICO";
  if (status === OS.REGULARIZACAO) return "Y04_REGULARIZACAO";
  return "Y01_COMPRA_NORMAL";
}

/**
 * Modo `regraPortalGerencial`: classifica uma linha aplicando a precedência da
 * TAREFA 3, COM as exclusões operacionais do portal (CódElim "L", Bloq/Frete,
 * fornecedor eliminado, serviço por Y0008).
 *
 * NÃO é a regra da aba Compras Pendentes — essa é `classifyPurchaseV31HtmlRule`.
 * Continua sendo a regra de Compras Realizadas, dos KPIs gerenciais e da
 * auditoria de itens fora do relatório.
 *
 * `today` é injetado (data dinâmica) para manter a função pura/testável.
 */
export function classifyPurchaseRecord(
  input: PurchaseClassificationInput,
  today: Date
): PurchaseClassification {
  // Exclusões (auditoria) — precedência 1→3.
  const isDeletionExcluded = isDeletionExcludedCode(input.deletionCode);
  const ignoredTerm = detectIgnoredDescriptionTerm(
    input.itemDescription,
    input.materialDescription,
    input.goodsGroupDescription,
    input.materialCode
  );
  const isBlocked = ignoredTerm === "bloq";
  const isFreight = ignoredTerm === "frete";
  const isEliminatedSupplier = isEliminatedSupplierName(input.supplierName, input.supplierCode);

  // Natureza (independe da exclusão; usada para separar serviço/Y04 e para auditoria).
  const isService = isServiceByGoodsGroup(input.goodsGroupCode, input.goodsGroupDescription);
  const purchaseType = classifyPurchaseType(input.purchasingGroup);
  const isRegularization = purchaseType === PurchaseType.REGULARIZACAO || isRegularizationByGroup(input.purchasingGroup);

  // Flags do funil.
  const hasPurchaseOrder = isValidSapDocument(input.purchaseOrderNumber);
  const isReceiptConfirmed = isMarkedX(input.receiptFlag);
  const isDelivered = isReceiptConfirmed && input.receiptDate !== null;
  const isLateReceived =
    isDelivered &&
    input.expectedDeliveryDate !== null &&
    input.receiptDate!.getTime() > input.expectedDeliveryDate.getTime();

  // Resolve status + motivo por precedência.
  let operationalStatus: PurchaseOperationalStatus;
  let classificationReason: string;

  if (isDeletionExcluded) {
    operationalStatus = OS.IGNORADO;
    classificationReason = 'Excluído: CódElim "L"';
  } else if (isBlocked) {
    operationalStatus = OS.IGNORADO;
    classificationReason = "Excluído: descrição contém Bloqueado";
  } else if (isFreight) {
    operationalStatus = OS.IGNORADO;
    classificationReason = "Excluído: descrição contém Frete";
  } else if (isEliminatedSupplier) {
    operationalStatus = OS.IGNORADO;
    classificationReason = "Excluído: fornecedor eliminado";
  } else if (isService) {
    operationalStatus = OS.SERVICO;
    classificationReason = "Separado: Grupo Merc Y0008 - Serviço";
  } else if (isRegularization) {
    operationalStatus = OS.REGULARIZACAO;
    classificationReason = "Separado: Grupo Comp Y04 - Regularização";
  } else if (isDelivered) {
    operationalStatus = OS.ENTREGUE;
    classificationReason = isLateReceived
      ? "Incluído: entregue (recebimento + Recbconcl X) após a previsão"
      : "Incluído: entregue (recebimento + Recbconcl X)";
  } else if (
    hasPurchaseOrder &&
    input.expectedDeliveryDate !== null &&
    startOfDay(input.expectedDeliveryDate).getTime() < startOfDay(today).getTime()
  ) {
    operationalStatus = OS.ATRASADO;
    classificationReason = "Incluído: Y01 com previsão vencida e sem recebimento";
  } else if (hasPurchaseOrder) {
    operationalStatus = OS.COMPRADO;
    classificationReason = "Incluído: Y01 com pedido de compra";
  } else {
    operationalStatus = OS.PENDENTE_COMPRA;
    classificationReason = "Incluído: Y01 sem pedido vinculado";
  }

  const isIgnored = operationalStatus === OS.IGNORADO;

  return {
    isIgnored,
    ignoreReason: isIgnored ? classificationReason.replace(/^Excluído:\s*/, "") : null,
    purchaseNature: natureForStatus(operationalStatus),
    operationalStatus,
    reportGroup: reportGroupFor(operationalStatus),
    classificationReason,
    purchaseType,
    purchaseKind: purchaseKindFromType(purchaseType),
    isService,
    isRegularization,
    isBlocked,
    isFreight,
    isEliminatedSupplier,
    isDeletionExcluded,
    hasPurchaseOrder,
    isReceiptConfirmed,
    isDelivered,
    isLateReceived
  };
}

/** Nome explícito do modo gerencial, para quem lê a chamada e não o JSDoc. */
export { classifyPurchaseRecord as classifyPurchaseRegraPortalGerencial };

/**
 * Recalcula o status a partir de flags JÁ persistidas (colunas do banco) + hoje.
 * Usada na LEITURA para a fronteira COMPRADO/ATRASADO acompanhar o dia atual,
 * sem depender do valor congelado no import. Mesma precedência do classificador.
 */
export function resolveOperationalStatusFromFlags(
  input: {
    isIgnored: boolean;
    isService: boolean;
    isRegularization: boolean;
    hasPurchaseOrder: boolean;
    /** Recbconcl = "X". */
    isReceiptConfirmed: boolean;
    receiptDate: Date | null;
    expectedDeliveryDate: Date | null;
  },
  today: Date
): PurchaseOperationalStatus {
  if (input.isIgnored) return OS.IGNORADO;
  if (input.isService) return OS.SERVICO;
  if (input.isRegularization) return OS.REGULARIZACAO;
  const isDelivered = input.isReceiptConfirmed && input.receiptDate !== null;
  if (isDelivered) return OS.ENTREGUE;
  if (
    input.hasPurchaseOrder &&
    input.expectedDeliveryDate !== null &&
    startOfDay(input.expectedDeliveryDate).getTime() < startOfDay(today).getTime()
  ) {
    return OS.ATRASADO;
  }
  if (input.hasPurchaseOrder) return OS.COMPRADO;
  return OS.PENDENTE_COMPRA;
}

/* ------------------------------------------------------------------ */
/* Rótulos e cores do status operacional (UI premium)                 */
/* ------------------------------------------------------------------ */

export const PURCHASE_OPERATIONAL_STATUS_LABELS: Record<PurchaseOperationalStatus, string> = {
  PENDENTE_COMPRA: "Pendente de compra",
  COMPRADO: "Comprado",
  ATRASADO: "Atrasado",
  ENTREGUE: "Entregue",
  REGULARIZACAO: "Regularização Y04",
  SERVICO: "Serviço Y0008",
  IGNORADO: "Ignorado"
};

/** Ordem estável dos status para filtros/cards/legendas. */
export const PURCHASE_OPERATIONAL_STATUS_ORDER: PurchaseOperationalStatus[] = [
  OS.ATRASADO,
  OS.PENDENTE_COMPRA,
  OS.COMPRADO,
  OS.ENTREGUE,
  OS.REGULARIZACAO,
  OS.SERVICO,
  OS.IGNORADO
];

export const PURCHASE_OPERATIONAL_STATUS_COLORS: Record<PurchaseOperationalStatus, string> = {
  ATRASADO: SEMANTIC.danger.DEFAULT,
  PENDENTE_COMPRA: SEMANTIC.warning.DEFAULT,
  COMPRADO: CHART_SERIES.preventiva,
  ENTREGUE: CHART_SERIES.producao,
  REGULARIZACAO: CHART_SERIES.automacao,
  SERVICO: SEMANTIC.neutral.DEFAULT,
  IGNORADO: CHART_SERIES.outros
};

export const PURCHASE_KIND_LABELS: Record<PurchaseKind, string> = {
  Y01_NORMAL: "Compra normal (Y01)",
  Y04_REGULARIZACAO: "Regularização (Y04)",
  OUTROS: "Outros"
};

/** Rótulos do filtro "Tipo" (TAREFA 16). */
export const PURCHASE_KIND_FILTER_LABELS: Record<string, string> = {
  material: "Material",
  servico: "Serviço (Y0008)",
  regularizacao: "Regularização (Y04)",
  ignorado: "Ignorado"
};

/** Campos de data filtráveis e seus rótulos. */
export const PURCHASE_DATE_FIELD_LABELS: Record<string, string> = {
  purchaseOrderDate: "Data do pedido",
  expectedDeliveryDate: "Previsão de entrega",
  receiptDate: "Data de recebimento",
  requisitionDate: "Data da requisição"
};

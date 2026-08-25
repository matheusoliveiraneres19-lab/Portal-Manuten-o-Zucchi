/**
 * Service de Compras — FONTE ÚNICA dos indicadores de compras do portal.
 *
 * Aplica as regras do painel `acompanhamento_compras_v3 (2).html`. O status
 * operacional é derivado das colunas-base + a data ATUAL (REGRA 10): a fronteira
 * EM_ATRASO/NAO_ENTREGUE acompanha o dia de hoje, sem depender do valor
 * congelado na importação. A coluna `operationalStatus` permanece gravada apenas
 * para auditoria.
 *
 * Mantém as funções consumidas pelo dashboard principal
 * (getPendingPurchasesCount / getPendingPurchases / getPurchasesByMonth).
 */
import { Prisma, PurchaseOperationalStatus, PurchaseStatus, PurchaseType } from "@prisma/client";
import type { PageDataSource } from "@/types/page-data";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  getPurchaseRecordReferenceDate,
  normalizeClassificationLevel,
  resolvePurchaseValue
} from "@/utils/purchases-normalizer";
import {
  PURCHASE_OPERATIONAL_STATUS_LABELS,
  classificationReasonFor,
  classifyPurchaseV31HtmlRule,
  emptyPurchaseV31Audit,
  operationalStatusForV31Group,
  reportGroupFor,
  resolveOperationalStatusFromFlags,
  type PurchaseKind,
  type PurchaseV31Audit,
  type PurchaseV31Group
} from "@/utils/purchase-classification";
import { getTodayDate } from "@/utils/date";
import type { PendingPurchaseData, PurchasesByMonthData } from "@/types/dashboard";
import type {
  CompletedPurchasesPageData,
  PaginatedPurchases,
  PendingPurchasesPageData,
  PurchaseClassificationInsights,
  PurchaseClassificationNode,
  PurchaseClassificationOptions,
  PurchaseClassificationSlice,
  PurchaseFilterOptions,
  PurchaseGroupCount,
  PurchaseKindFilter,
  PurchaseKpis,
  PurchaseMonthlyPoint,
  PurchaseProcessRankItem,
  PurchaseProcessTimes,
  PurchaseQueryParams,
  PurchaseRequesterCount,
  PurchaseRow,
  PurchaseSupplierSlice
} from "@/types/purchases";

const DEFAULT_PAGE_SIZE = 50;
const OS = PurchaseOperationalStatus;

/**
 * A aba Compras Pendentes NÃO usa o vocabulário de status gerencial: ela segue a
 * REGRA OFICIAL v3.1 (`v31Where("PENDENTE_COMPRA")`), definida mais abaixo.
 *
 * Status que compõem a página de Compras Realizadas (tabela).
 */
const COMPLETED_TABLE_STATUSES: PurchaseOperationalStatus[] = [OS.COMPRADO, OS.ENTREGUE];

/** Início do dia atual em UTC — referência da comparação de atraso (dia-calendário). */
function startOfTodayUtc(today: Date): Date {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

/* ------------------------------------------------------------------ */
/* Predicados de status (dinâmicos por data)                          */
/* ------------------------------------------------------------------ */

/** Base Y01 material: fora do relatório (ignored), serviço (Y0008) e Y04 excluídos. */
const Y01_BASE: Prisma.PurchaseRecordWhereInput = {
  ignored: false,
  isService: false,
  purchaseType: { not: PurchaseType.REGULARIZACAO }
};

/** Entregue = recebimento lançado + Recbconcl "X". */
const DELIVERED: Prisma.PurchaseRecordWhereInput = { isReceiptConfirmed: true, receiptDate: { not: null } };
/** Ainda não entregue (nega o "entregue"). */
const NOT_DELIVERED: Prisma.PurchaseRecordWhereInput = { NOT: { isReceiptConfirmed: true, receiptDate: { not: null } } };
/** Requisição de compra preenchida (só assim é "requisição pendente de compra"). */
const HAS_REQUISITION: Prisma.PurchaseRecordWhereInput = { requisitionNumber: { not: null } };

/** Cláusula Prisma para cada status operacional (mutuamente exclusivo), com a data atual. */
function statusWhere(status: PurchaseOperationalStatus, today: Date): Prisma.PurchaseRecordWhereInput {
  const startToday = startOfTodayUtc(today);
  switch (status) {
    case OS.IGNORADO:
      return { ignored: true };
    case OS.SERVICO:
      return { ignored: false, isService: true };
    case OS.REGULARIZACAO:
      return { ignored: false, isService: false, purchaseType: PurchaseType.REGULARIZACAO };
    case OS.ENTREGUE:
      return { ...Y01_BASE, ...DELIVERED };
    case OS.ATRASADO:
      return { ...Y01_BASE, ...NOT_DELIVERED, hasPurchaseOrder: true, expectedDeliveryDate: { lt: startToday } };
    case OS.COMPRADO:
      return {
        ...Y01_BASE,
        ...NOT_DELIVERED,
        hasPurchaseOrder: true,
        OR: [{ expectedDeliveryDate: null }, { expectedDeliveryDate: { gte: startToday } }]
      };
    case OS.PENDENTE_COMPRA:
      return { ...Y01_BASE, ...NOT_DELIVERED, ...HAS_REQUISITION, hasPurchaseOrder: false };
    default:
      return {};
  }
}

/* ------------------------------------------------------------------ */
/* REGRA OFICIAL v3.1 (HTML) — escopo da aba Compras Pendentes         */
/* ------------------------------------------------------------------ */

/**
 * Tradução para SQL da `classifyPurchaseV31HtmlRule`. As cláusulas leem as
 * COLUNAS CRUAS gravadas na importação (`goodsGroupDescription`,
 * `purchasingGroup`, `purchaseOrderNumber`, `receiptDate`,
 * `expectedDeliveryDate`) — de propósito NÃO usam as flags derivadas
 * (`ignored`, `isService`, `purchaseType`), que carregam as exclusões da regra
 * gerencial e não existem no HTML.
 *
 * Consequência prática: nenhuma reimportação é necessária para a aba passar a
 * seguir a regra v3.1, e a regra não pode "envelhecer" junto com as flags.
 *
 * Toda negação é escrita com `OR [{campo: null}, {NOT ...}]` porque em SQL
 * `NOT (coluna ILIKE ...)` é NULL quando a coluna é NULL — e a linha sumiria da
 * base de análise em vez de entrar nela.
 */
const V31_SERVICE: Prisma.PurchaseRecordWhereInput = {
  goodsGroupDescription: { contains: "servi", mode: "insensitive" }
};
const V31_NOT_SERVICE: Prisma.PurchaseRecordWhereInput = {
  OR: [{ goodsGroupDescription: null }, { NOT: V31_SERVICE }]
};
const V31_Y04: Prisma.PurchaseRecordWhereInput = {
  purchasingGroup: { equals: "Y04", mode: "insensitive" }
};
const V31_NOT_Y04: Prisma.PurchaseRecordWhereInput = {
  OR: [{ purchasingGroup: null }, { NOT: V31_Y04 }]
};
/** Base de análise = não é serviço E não é Y04. */
const V31_ANALYSIS_BASE: Prisma.PurchaseRecordWhereInput = { AND: [V31_NOT_SERVICE, V31_NOT_Y04] };

/** "Pedido de Compra"/"Data Recebimento" preenchidos — vazio vira NULL na importação. */
const V31_HAS_ORDER: Prisma.PurchaseRecordWhereInput = { NOT: { purchaseOrderNumber: null } };
const V31_NO_ORDER: Prisma.PurchaseRecordWhereInput = { purchaseOrderNumber: null };
const V31_RECEIVED: Prisma.PurchaseRecordWhereInput = { NOT: { receiptDate: null } };
const V31_NOT_RECEIVED: Prisma.PurchaseRecordWhereInput = { receiptDate: null };

/** Cláusula Prisma de cada grupo da regra v3.1 (mutuamente exclusivos). */
function v31Where(group: PurchaseV31Group, today: Date): Prisma.PurchaseRecordWhereInput {
  const startToday = startOfTodayUtc(today);
  switch (group) {
    case "SERVICOS":
      return V31_SERVICE;
    case "REGULARIZACAO":
      return { AND: [V31_NOT_SERVICE, V31_Y04] };
    case "RECEBIDOS":
      return { AND: [V31_ANALYSIS_BASE, V31_RECEIVED] };
    case "PENDENTE_COMPRA":
      return { AND: [V31_ANALYSIS_BASE, V31_NO_ORDER, V31_NOT_RECEIVED] };
    case "EM_ATRASO":
      return {
        AND: [V31_ANALYSIS_BASE, V31_HAS_ORDER, V31_NOT_RECEIVED, { expectedDeliveryDate: { lt: startToday } }]
      };
    case "NAO_ENTREGUES":
      return {
        AND: [
          V31_ANALYSIS_BASE,
          V31_HAS_ORDER,
          V31_NOT_RECEIVED,
          { OR: [{ expectedDeliveryDate: null }, { expectedDeliveryDate: { gte: startToday } }] }
        ]
      };
    default:
      return {};
  }
}

/**
 * RETRATO ATUAL: só as linhas presentes na importação mais recente.
 *
 * O painel HTML sempre parte da planilha INTEIRA (`raw`), então o retrato dele é
 * sempre o do arquivo carregado. O portal acumula: a `technicalKey` inclui o
 * Pedido de Compra, de modo que, quando a requisição vira pedido, uma linha NOVA
 * é criada e a antiga (sem pedido) fica no banco para sempre — aparecendo como
 * "pendente" mesmo depois de comprada e recebida.
 *
 * Limitar a aba ao último lote elimina esse resíduo sem apagar histórico algum:
 * cada importação regrava `importBatch` em toda linha que veio na planilha, logo
 * "último lote" == "presente no export atual do SAP".
 *
 * Em Compras Pendentes o recorte é FIXO (é a regra da aba). Compras Realizadas o
 * oferece como alternância (`params.latestImportOnly`, ver `snapshotWhere`) e
 * mantém o histórico completo por padrão: lá as compras das planilhas anteriores
 * são justamente o que se quer ver.
 */
const loadLatestImportBatch = cache(async (): Promise<string | null> => {
  const latest = await prisma.purchaseRecord.findFirst({
    where: { importBatch: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { importBatch: true }
  });
  return latest?.importBatch ?? null;
});

/** Cláusula do retrato atual (vazia quando não há nenhuma importação). */
async function latestImportWhere(): Promise<Prisma.PurchaseRecordWhereInput> {
  const batch = await loadLatestImportBatch();
  return batch ? { importBatch: batch } : {};
}

/**
 * Recorte OPCIONAL do retrato atual, ligado pelo usuário (`retrato=atual` na
 * URL de Compras Realizadas). Sem a opção marcada devolve cláusula vazia, e a
 * aba segue mostrando o histórico completo de todas as importações.
 *
 * Toda consulta da aba passa por aqui — tabela, cards, gráficos e tempos de
 * processo — para que a alternância nunca deixe um card falando de um recorte e
 * a tabela de outro.
 */
async function snapshotWhere(params: PurchaseQueryParams): Promise<Prisma.PurchaseRecordWhereInput> {
  return params.latestImportOnly ? latestImportWhere() : {};
}

/**
 * Auditoria da regra v3.1 sobre a base já importada (TAREFA 16), no MESMO
 * formato do painel HTML. Os oito totais saem de contagens SQL derivadas de
 * `v31Where`, então batem exatamente com o que a tabela e os cards exibem.
 *
 * `totalLido` é o total do RETRATO ATUAL — equivalente ao `raw.length` do HTML.
 */
export async function getPurchaseV31Audit(
  params: PurchaseQueryParams = {},
  today: Date = getTodayDate()
): Promise<PurchaseV31Audit> {
  const base = mergeWhere(buildFilterWhere(params, today), await latestImportWhere());
  const count = (group: PurchaseV31Group) =>
    prisma.purchaseRecord.count({ where: mergeWhere(base, v31Where(group, today)) });

  const [totalLido, servicosExcluidos, regularizacaoY04, recebidos, pendenteCompra, emAtraso, naoEntregues] =
    await Promise.all([
      prisma.purchaseRecord.count({ where: base }),
      count("SERVICOS"),
      count("REGULARIZACAO"),
      count("RECEBIDOS"),
      count("PENDENTE_COMPRA"),
      count("EM_ATRASO"),
      count("NAO_ENTREGUES")
    ]);

  return {
    totalLido,
    servicosExcluidos,
    regularizacaoY04,
    baseAnalise: recebidos + pendenteCompra + emAtraso + naoEntregues,
    recebidos,
    pendenteCompra,
    emAtraso,
    naoEntregues
  };
}

/** Comprados = base Y01 material com pedido de compra (COMPRADO + ATRASADO + ENTREGUE). */
function purchasedWhere(): Prisma.PurchaseRecordWhereInput {
  return { ...Y01_BASE, hasPurchaseOrder: true };
}

/** Comprados ainda não entregues = com pedido, sem recebimento concluído (COMPRADO + ATRASADO). */
function purchasedNotDeliveredWhere(): Prisma.PurchaseRecordWhereInput {
  return { ...Y01_BASE, ...NOT_DELIVERED, hasPurchaseOrder: true };
}

/** Pendente de compra = base Y01 material, com requisição e sem pedido de compra. */
function pendingPurchaseWhere(): Prisma.PurchaseRecordWhereInput {
  return { ...Y01_BASE, ...NOT_DELIVERED, ...HAS_REQUISITION, hasPurchaseOrder: false };
}

/* ------------------------------------------------------------------ */
/* WHERE builders                                                     */
/* ------------------------------------------------------------------ */

function buildDateRange(params: PurchaseQueryParams): Prisma.DateTimeFilter | null {
  if (!params.startDate && !params.endDate) {
    return null;
  }
  const range: Prisma.DateTimeFilter = {};
  if (params.startDate) {
    range.gte = new Date(`${params.startDate}T00:00:00.000Z`);
  }
  if (params.endDate) {
    range.lte = new Date(`${params.endDate}T23:59:59.999Z`);
  }
  return range;
}

/** Filtros do usuário (sem escopo de página e sem "Tipo"). AND entre grupos; OR no grupo. */
function buildFilterWhere(params: PurchaseQueryParams = {}, today: Date): Prisma.PurchaseRecordWhereInput {
  const and: Prisma.PurchaseRecordWhereInput[] = [];

  const range = buildDateRange(params);
  if (range) {
    if (params.dateField) {
      and.push({ [params.dateField]: range } as Prisma.PurchaseRecordWhereInput);
    } else {
      and.push({
        OR: [
          { purchaseOrderDate: range },
          { purchaseOrderDate: null, requisitionDate: range },
          { purchaseOrderDate: null, requisitionDate: null, expectedDeliveryDate: range }
        ]
      });
    }
  }

  if (params.suppliers?.length) {
    and.push({ supplierName: { in: params.suppliers } });
  }
  if (params.categories?.length) {
    and.push({ goodsGroupCode: { in: params.categories } });
  }
  if (params.purchasingGroups?.length) {
    and.push({ purchasingGroup: { in: params.purchasingGroups } });
  }
  if (params.requesters?.length) {
    and.push({ requester: { in: params.requesters } });
  }
  // Classificação N1..N4: AND entre níveis, OR dentro de cada nível. Aplicado no
  // SQL para que tabela, paginação, KPIs e gráficos vejam exatamente o mesmo
  // conjunto — sem recorte paralelo na UI.
  for (const [field, values] of [
    ["classificationN1", params.classificationsN1],
    ["classificationN2", params.classificationsN2],
    ["classificationN3", params.classificationsN3],
    ["classificationN4", params.classificationsN4]
  ] as const) {
    if (values?.length) {
      and.push({ [field]: { in: values } } as Prisma.PurchaseRecordWhereInput);
    }
  }
  if (params.statuses?.length) {
    and.push({ OR: params.statuses.map((status) => statusWhere(status, today)) });
  }

  const term = params.search?.trim();
  if (term) {
    and.push({
      OR: [
        { itemDescription: { contains: term, mode: "insensitive" } },
        { materialCode: { contains: term, mode: "insensitive" } },
        { supplierName: { contains: term, mode: "insensitive" } },
        { requisitionNumber: { contains: term, mode: "insensitive" } },
        { purchaseOrderNumber: { contains: term, mode: "insensitive" } }
      ]
    });
  }

  return and.length ? { AND: and } : {};
}

function mergeWhere(...clauses: Prisma.PurchaseRecordWhereInput[]): Prisma.PurchaseRecordWhereInput {
  return { AND: clauses };
}

/** Status de um "Tipo" (filtro). "material" = os status default da página. */
function kindStatuses(kind: PurchaseKindFilter, pageDefault: PurchaseOperationalStatus[]): PurchaseOperationalStatus[] {
  switch (kind) {
    case "material":
      return pageDefault;
    case "servico":
      return [OS.SERVICO];
    case "regularizacao":
      return [OS.REGULARIZACAO];
    case "ignorado":
      return [OS.IGNORADO];
    default:
      return [];
  }
}

/** Escopo da tabela por status (default da página) + filtro "Tipo". */
function scopeByKind(
  kinds: PurchaseKindFilter[] | undefined,
  pageDefault: PurchaseOperationalStatus[],
  today: Date
): Prisma.PurchaseRecordWhereInput {
  const statuses = kinds?.length
    ? Array.from(new Set(kinds.flatMap((kind) => kindStatuses(kind, pageDefault))))
    : pageDefault;
  return { OR: statuses.map((status) => statusWhere(status, today)) };
}

/**
 * Página Pendentes: SOMENTE o grupo `PENDENTE_COMPRA` da REGRA OFICIAL v3.1 —
 * base de análise (não serviço, não Y04), sem Pedido de Compra e sem Data
 * Recebimento.
 *
 * O escopo é fixo: os filtros "Tipo" e "Status" (vocabulário gerencial) não se
 * aplicam aqui e nem são oferecidos na tela, para não misturar as duas regras.
 * Também NÃO se exige `Requisição` preenchida — o HTML não exige.
 *
 * Restrito ao RETRATO ATUAL (última importação) — ver `latestImportWhere`.
 */
async function pendingWhere(params: PurchaseQueryParams, today: Date): Promise<Prisma.PurchaseRecordWhereInput> {
  return mergeWhere(buildFilterWhere(params, today), await latestImportWhere(), v31Where("PENDENTE_COMPRA", today));
}

/**
 * Página Realizadas: COMPRADO + ENTREGUE (respeita o filtro "Tipo") e o recorte
 * opcional do retrato atual (ver `snapshotWhere`).
 */
async function completedWhere(params: PurchaseQueryParams, today: Date): Promise<Prisma.PurchaseRecordWhereInput> {
  return mergeWhere(
    buildFilterWhere(params, today),
    await snapshotWhere(params),
    scopeByKind(params.kinds, COMPLETED_TABLE_STATUSES, today)
  );
}

/* ------------------------------------------------------------------ */
/* Soma de valor (Total liq, fallback Total bruto)                    */
/* ------------------------------------------------------------------ */

async function sumPurchaseValue(where: Prisma.PurchaseRecordWhereInput): Promise<number> {
  const [net, gross] = await Promise.all([
    prisma.purchaseRecord.aggregate({
      _sum: { netTotal: true },
      where: mergeWhere(where, { NOT: [{ netTotal: null }, { netTotal: 0 }] })
    }),
    prisma.purchaseRecord.aggregate({
      _sum: { grossTotal: true },
      where: mergeWhere(where, { OR: [{ netTotal: null }, { netTotal: 0 }] })
    })
  ]);
  return round((net._sum.netTotal ?? 0) + (gross._sum.grossTotal ?? 0));
}

/* ------------------------------------------------------------------ */
/* Resumo canônico (KPIs) — REGRA 15                                  */
/* ------------------------------------------------------------------ */

export const getPurchaseSummary = cache(async (params: PurchaseQueryParams = {}): Promise<PurchaseKpis> => {
  const today = getTodayDate();
  // O retrato atual entra no `base`, e não em cada contagem: assim os KPIs da
  // aba acompanham a alternância junto com a tabela e os gráficos.
  const base = mergeWhere(buildFilterWhere(params, today), await snapshotWhere(params));
  const y01 = mergeWhere(base, Y01_BASE);
  const count = (where: Prisma.PurchaseRecordWhereInput) => prisma.purchaseRecord.count({ where });

  const [
    baseY01,
    purchased,
    purchasedNotDelivered,
    pendingPurchase,
    inTransit,
    late,
    delivered,
    deliveredLate,
    regularizations,
    regularizationsDelivered,
    services,
    servicesDelivered,
    ignored,
    totalValue,
    pendingValue,
    deliveredValue,
    purchasedValue,
    lateValue
  ] = await Promise.all([
    count(y01),
    count(mergeWhere(base, purchasedWhere())),
    count(mergeWhere(base, purchasedNotDeliveredWhere())),
    count(mergeWhere(base, pendingPurchaseWhere())),
    count(mergeWhere(base, statusWhere(OS.COMPRADO, today))),
    count(mergeWhere(base, statusWhere(OS.ATRASADO, today))),
    count(mergeWhere(base, statusWhere(OS.ENTREGUE, today))),
    count(mergeWhere(base, statusWhere(OS.ENTREGUE, today), { isLateReceived: true })),
    count(mergeWhere(base, statusWhere(OS.REGULARIZACAO, today))),
    count(mergeWhere(base, statusWhere(OS.REGULARIZACAO, today), DELIVERED)),
    count(mergeWhere(base, statusWhere(OS.SERVICO, today))),
    count(mergeWhere(base, statusWhere(OS.SERVICO, today), DELIVERED)),
    count(mergeWhere(base, { ignored: true })),
    sumPurchaseValue(mergeWhere(base, { ignored: false })),
    sumPurchaseValue(mergeWhere(base, pendingPurchaseWhere())),
    sumPurchaseValue(mergeWhere(base, statusWhere(OS.ENTREGUE, today))),
    sumPurchaseValue(mergeWhere(base, purchasedWhere())),
    sumPurchaseValue(mergeWhere(base, statusWhere(OS.ATRASADO, today)))
  ]);

  return {
    totalRecords: baseY01 + services + regularizations + ignored,
    baseY01,
    purchased,
    purchasedValue,
    purchasedNotDelivered,
    pendingPurchase,
    pendingValue,
    inTransit,
    late,
    lateValue,
    delivered,
    deliveredValue,
    deliveredLate,
    regularizations,
    regularizationsDelivered,
    services,
    servicesDelivered,
    ignored,
    totalValue
  };
});

/* ------------------------------------------------------------------ */
/* Listagens paginadas                                                */
/* ------------------------------------------------------------------ */

const rowSelect = {
  id: true,
  purchaseOrderNumber: true,
  requisitionNumber: true,
  supplierCode: true,
  supplierName: true,
  materialCode: true,
  itemDescription: true,
  quantity: true,
  pendingQuantity: true,
  unit: true,
  netTotal: true,
  grossTotal: true,
  requisitionDate: true,
  purchaseOrderDate: true,
  expectedDeliveryDate: true,
  receiptDate: true,
  isService: true,
  isBlocked: true,
  ignored: true,
  ignoredReason: true,
  isReceiptConfirmed: true,
  isLateReceived: true,
  hasPurchaseOrder: true,
  deletionCode: true,
  delayDays: true,
  purchasingGroup: true,
  purchaseType: true,
  goodsGroupCode: true,
  goodsGroupDescription: true,
  classificationN1: true,
  classificationN2: true,
  classificationN3: true,
  classificationN4: true,
  itemNature: true,
  requester: true
} satisfies Prisma.PurchaseRecordSelect;

type RowRecord = Prisma.PurchaseRecordGetPayload<{ select: typeof rowSelect }>;

function purchaseKindFromType(type: PurchaseType): PurchaseKind {
  if (type === PurchaseType.NORMAL) return "Y01_NORMAL";
  if (type === PurchaseType.REGULARIZACAO) return "Y04_REGULARIZACAO";
  return "OUTROS";
}

/** Qual regra descreve a linha na tabela. Ver o cabeçalho de purchase-classification. */
type PurchaseRuleMode = "v31Html" | "regraPortalGerencial";

/**
 * Status/natureza/motivo da linha sob a REGRA v3.1. Recalcula a classificação a
 * partir das colunas cruas para que o badge da tabela NUNCA divirja da cláusula
 * SQL que selecionou a linha — inclusive para registros que a regra gerencial
 * marcaria como "Ignorado" e que na v3.1 são pendências legítimas.
 */
function describeV31(record: RowRecord, today: Date) {
  const v31 = classifyPurchaseV31HtmlRule(
    {
      goodsGroupDescription: record.goodsGroupDescription,
      purchasingGroup: record.purchasingGroup,
      purchaseOrderNumber: record.purchaseOrderNumber,
      receiptDate: record.receiptDate,
      expectedDeliveryDate: record.expectedDeliveryDate
    },
    today
  );
  return {
    operationalStatus: operationalStatusForV31Group(v31.group),
    isService: v31.isService,
    isRegularization: v31.isRegularization,
    reason: v31.reason
  };
}

function toRow(record: RowRecord, today: Date, rule: PurchaseRuleMode = "regraPortalGerencial"): PurchaseRow {
  const isV31 = rule === "v31Html";
  const v31 = isV31 ? describeV31(record, today) : null;

  const isRegularization = v31 ? v31.isRegularization : record.purchaseType === PurchaseType.REGULARIZACAO;
  const isService = v31 ? v31.isService : record.isService;
  const operationalStatus =
    v31?.operationalStatus ??
    resolveOperationalStatusFromFlags(
      {
        isIgnored: record.ignored,
        isService: record.isService,
        isRegularization,
        hasPurchaseOrder: record.hasPurchaseOrder,
        isReceiptConfirmed: record.isReceiptConfirmed,
        receiptDate: record.receiptDate,
        expectedDeliveryDate: record.expectedDeliveryDate
      },
      today
    );
  return {
    id: record.id,
    purchaseOrderNumber: record.purchaseOrderNumber,
    requisitionNumber: record.requisitionNumber,
    supplierCode: record.supplierCode,
    supplierName: record.supplierName,
    materialCode: record.materialCode,
    itemDescription: record.itemDescription,
    quantity: record.quantity,
    pendingQuantity: record.pendingQuantity,
    unit: record.unit,
    value: resolvePurchaseValue(record.netTotal, record.grossTotal),
    requisitionDate: toIso(record.requisitionDate),
    purchaseOrderDate: toIso(record.purchaseOrderDate),
    expectedDeliveryDate: toIso(record.expectedDeliveryDate),
    receiptDate: toIso(record.receiptDate),
    operationalStatus,
    statusLabel: PURCHASE_OPERATIONAL_STATUS_LABELS[operationalStatus],
    purchaseNature:
      operationalStatus === OS.IGNORADO
        ? "IGNORADO"
        : operationalStatus === OS.SERVICO
          ? "Y0008_SERVICO"
          : operationalStatus === OS.REGULARIZACAO
            ? "Y04_REGULARIZACAO"
            : "Y01_COMPRA_NORMAL",
    reportGroup: reportGroupFor(operationalStatus),
    classificationReason: v31 ? v31.reason : classificationReasonFor(operationalStatus, record.ignoredReason),
    isService,
    isBlocked: record.isBlocked,
    isRegularization,
    // Na regra v3.1 não existe categoria "Ignorados": as flags de exclusão da
    // regra gerencial são zeradas para não vazarem em rótulo, chip ou filtro.
    isIgnored: isV31 ? false : record.ignored,
    ignoreReason: isV31 ? null : record.ignoredReason,
    purchaseKind: purchaseKindFromType(record.purchaseType),
    delayDays: record.delayDays,
    hasPurchaseOrder: record.hasPurchaseOrder,
    isReceiptConfirmed: record.isReceiptConfirmed,
    deletionCode: record.deletionCode,
    purchasingGroup: record.purchasingGroup,
    purchaseType: record.purchaseType,
    goodsGroupCode: record.goodsGroupCode,
    goodsGroupDescription: record.goodsGroupDescription,
    classificationN1: record.classificationN1,
    classificationN2: record.classificationN2,
    classificationN3: record.classificationN3,
    classificationN4: record.classificationN4,
    itemNature: record.itemNature,
    requester: record.requester
  };
}

async function paginate(
  where: Prisma.PurchaseRecordWhereInput,
  params: PurchaseQueryParams,
  today: Date,
  orderBy: Prisma.PurchaseRecordOrderByWithRelationInput[],
  rule: PurchaseRuleMode = "regraPortalGerencial"
): Promise<PaginatedPurchases> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = clampPageSize(params.pageSize);

  const [total, records] = await Promise.all([
    prisma.purchaseRecord.count({ where }),
    prisma.purchaseRecord.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: rowSelect })
  ]);

  return {
    data: records.map((record) => toRow(record, today, rule)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

/**
 * Compras pendentes (paginadas) — REGRA OFICIAL v3.1, grupo `pendente_compra`.
 * Ordena pela requisição mais antiga primeiro: pendências não têm previsão de
 * entrega (não há pedido), então a idade da requisição é o critério útil.
 */
export async function getPendingPurchasesList(params: PurchaseQueryParams = {}, today: Date = getTodayDate()): Promise<PaginatedPurchases> {
  return paginate(
    await pendingWhere(params, today),
    params,
    today,
    [{ requisitionDate: "asc" }, { requisitionNumber: "asc" }],
    "v31Html"
  );
}

/** Compras realizadas (paginadas) — REGRA 12. */
export async function getCompletedPurchasesList(params: PurchaseQueryParams = {}, today: Date = getTodayDate()): Promise<PaginatedPurchases> {
  return paginate(await completedWhere(params, today), params, today, [{ receiptDate: "desc" }]);
}

/* ------------------------------------------------------------------ */
/* Carregadores memoizados (1 varredura por escopo/request)           */
/* ------------------------------------------------------------------ */

const analysisSelect = {
  supplierName: true,
  requester: true,
  materialCode: true,
  requisitionNumber: true,
  goodsGroupCode: true,
  goodsGroupDescription: true,
  classificationN1: true,
  classificationN2: true,
  classificationN3: true,
  classificationN4: true,
  requisitionDate: true,
  expectedDeliveryDate: true,
  receiptDate: true,
  netTotal: true,
  grossTotal: true,
  isService: true,
  isBlocked: true,
  ignored: true,
  isReceiptConfirmed: true,
  hasPurchaseOrder: true,
  isLateReceived: true,
  purchaseType: true
} satisfies Prisma.PurchaseRecordSelect;

type AnalysisRow = Prisma.PurchaseRecordGetPayload<{ select: typeof analysisSelect }>;

/**
 * Registros da aba Compras Pendentes — SOMENTE o grupo `pendente_compra` da
 * regra v3.1 (TAREFA 15). Cards, gráficos e dashboards N1..N4 leem daqui, então
 * é impossível um deles somar serviços, Y04, recebidos, atrasados ou não
 * entregues: o recorte já vem do mesmo SQL que alimenta a tabela.
 */
const loadPendingAnalysisRows = cache(async (params: PurchaseQueryParams = {}): Promise<AnalysisRow[]> => {
  const today = getTodayDate();
  return prisma.purchaseRecord.findMany({
    where: mergeWhere(buildFilterWhere(params, today), await latestImportWhere(), v31Where("PENDENTE_COMPRA", today)),
    select: analysisSelect
  });
});

/** Entregues (recebimento lançado + Recbconcl "X") — gráficos de recebimento. */
const loadCompletedAnalysisRows = cache(async (params: PurchaseQueryParams = {}): Promise<AnalysisRow[]> =>
  prisma.purchaseRecord.findMany({
    where: mergeWhere(buildFilterWhere(params, getTodayDate()), await snapshotWhere(params), {
      ignored: false,
      ...DELIVERED
    }),
    select: analysisSelect
  })
);

/**
 * Registros da TABELA de Compras Realizadas (COMPRADO + ENTREGUE) — base da
 * análise N1..N4 da aba. Usa exatamente a mesma cláusula da tabela, então a
 * árvore, os gráficos por nível e o total paginado nunca divergem.
 */
const loadCompletedTableRows = cache(async (params: PurchaseQueryParams = {}): Promise<AnalysisRow[]> => {
  const today = getTodayDate();
  return prisma.purchaseRecord.findMany({ where: await completedWhere(params, today), select: analysisSelect });
});

/** Y04 (todas, recebidas ou não) — gráfico de Regularização por grupo. */
const loadRegularizationRows = cache(async (params: PurchaseQueryParams = {}): Promise<AnalysisRow[]> =>
  prisma.purchaseRecord.findMany({
    where: mergeWhere(buildFilterWhere(params, getTodayDate()), await snapshotWhere(params), {
      ignored: false,
      isService: false,
      purchaseType: PurchaseType.REGULARIZACAO
    }),
    select: analysisSelect
  })
);

/* ------------------------------------------------------------------ */
/* Agregadores em memória                                             */
/* ------------------------------------------------------------------ */

function valueOf(record: AnalysisRow): number {
  return resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0;
}

function bucketByMonth(records: AnalysisRow[], field: "expectedDeliveryDate" | "receiptDate" | "requisitionDate"): PurchaseMonthlyPoint[] {
  const totals = new Map<string, { value: number; count: number }>();
  for (const record of records) {
    const date = record[field];
    if (!date) continue;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const entry = totals.get(key) ?? { value: 0, count: 0 };
    entry.value += valueOf(record);
    entry.count += 1;
    totals.set(key, entry);
  }
  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, entry]) => {
      const [year, month] = period.split("-").map(Number);
      const label = new Date(Date.UTC(year, month - 1, 1))
        .toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
        .replace(".", "");
      return { period, label: label.charAt(0).toUpperCase() + label.slice(1), value: round(entry.value), count: entry.count };
    });
}

function topSuppliersByCount(records: AnalysisRow[], limit = 7): PurchaseSupplierSlice[] {
  const totals = new Map<string, { totalValue: number; count: number }>();
  for (const record of records) {
    if (!record.supplierName) continue;
    const entry = totals.get(record.supplierName) ?? { totalValue: 0, count: 0 };
    entry.totalValue += valueOf(record);
    entry.count += 1;
    totals.set(record.supplierName, entry);
  }
  return Array.from(totals.entries())
    .map(([supplierName, entry]) => ({ supplierName, totalValue: round(entry.totalValue), count: entry.count }))
    .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
    .slice(0, limit);
}

function groupCountByGoodsGroup(records: AnalysisRow[], limit = 12): PurchaseGroupCount[] {
  const totals = new Map<string, PurchaseGroupCount>();
  for (const record of records) {
    const code = record.goodsGroupCode ?? "—";
    const entry = totals.get(code) ?? { code, description: record.goodsGroupDescription ?? code, count: 0 };
    entry.count += 1;
    if (!entry.description || entry.description === code) {
      entry.description = record.goodsGroupDescription ?? code;
    }
    totals.set(code, entry);
  }
  return Array.from(totals.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function topRequesters(records: AnalysisRow[], limit = 7): PurchaseRequesterCount[] {
  const totals = new Map<string, number>();
  for (const record of records) {
    if (!record.requester) continue;
    totals.set(record.requester, (totals.get(record.requester) ?? 0) + 1);
  }
  return Array.from(totals.entries())
    .map(([requester, count]) => ({ requester, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Classificação N1 > N2 > N3 > N4                                    */
/* ------------------------------------------------------------------ */

/** Campo do registro correspondente a cada nível. */
const CLASSIFICATION_FIELDS = ["classificationN1", "classificationN2", "classificationN3", "classificationN4"] as const;
type ClassificationField = (typeof CLASSIFICATION_FIELDS)[number];

/** Linha mínima para as agregações de classificação. */
export type ClassifiableRow = Pick<AnalysisRow, ClassificationField>;

/**
 * Conta as ocorrências de um nível agrupando pelo valor EXATO gravado.
 *
 * Deliberadamente NÃO mescla grafias equivalentes ("ELETRICA" vs. "Elétrica"):
 * o filtro da tabela usa `in` com o texto exato no SQL, então mesclar aqui faria
 * o gráfico mostrar um total que o filtro não consegue reproduzir. Com o
 * agrupamento exato, gráfico, filtro, tabela e paginação enxergam sempre o mesmo
 * conjunto — e uma planilha com a mesma categoria escrita de dois jeitos fica
 * visível para correção, em vez de silenciosamente escondida.
 *
 * Itens sem valor ficam de fora (não viram categoria falsa). Maior → menor.
 */
function countByLevel(rows: ClassifiableRow[], field: ClassificationField): PurchaseClassificationSlice[] {
  const totals = new Map<string, PurchaseClassificationSlice>();
  for (const row of rows) {
    const label = normalizeClassificationLevel(row[field]);
    if (!label) {
      continue;
    }
    const entry = totals.get(label) ?? { key: label, label, count: 0 };
    entry.count += 1;
    totals.set(label, entry);
  }
  return Array.from(totals.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

/**
 * Monta a árvore N1 > N2 > N3 > N4 (TAREFA 9). Um registro alimenta a contagem
 * de cada nível que possui; a descida para no primeiro nível vazio, para não
 * criar um ramo "sem nome" no meio da hierarquia.
 */
function buildClassificationTree(rows: ClassifiableRow[]): PurchaseClassificationNode[] {
  const roots = new Map<string, PurchaseClassificationNode>();

  for (const row of rows) {
    let level = roots;
    let node: PurchaseClassificationNode | null = null;

    for (const field of CLASSIFICATION_FIELDS) {
      const label = normalizeClassificationLevel(row[field]);
      if (!label) {
        break;
      }
      // Mesma decisão do `countByLevel`: agrupa pelo valor EXATO gravado.
      node = level.get(label) ?? { key: label, label, count: 0, children: [] };
      node.count += 1;
      level.set(label, node);
      // Índice auxiliar dos filhos para o próximo nível (Map só na montagem).
      level = childIndex(node);
    }
  }

  return sortNodes(Array.from(roots.values()));
}

/** Map de filhos de um nó (criado sob demanda e removido ao final). */
const CHILD_INDEX = new WeakMap<PurchaseClassificationNode, Map<string, PurchaseClassificationNode>>();

function childIndex(node: PurchaseClassificationNode): Map<string, PurchaseClassificationNode> {
  let index = CHILD_INDEX.get(node);
  if (!index) {
    index = new Map<string, PurchaseClassificationNode>();
    CHILD_INDEX.set(node, index);
  }
  return index;
}

/** Materializa `children` a partir do índice e ordena por contagem, recursivamente. */
function sortNodes(nodes: PurchaseClassificationNode[]): PurchaseClassificationNode[] {
  for (const node of nodes) {
    const index = CHILD_INDEX.get(node);
    node.children = index ? sortNodes(Array.from(index.values())) : [];
  }
  return nodes.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

/**
 * Aplica os filtros N1..N4 em memória (mesma semântica do SQL: AND entre níveis).
 * Exportada junto com os agregadores abaixo para permitir verificação isolada,
 * sem depender de dados gravados no banco.
 */
export function matchesClassificationFilters(row: ClassifiableRow, params: PurchaseQueryParams): boolean {
  const selections: Array<[ClassificationField, string[] | undefined]> = [
    ["classificationN1", params.classificationsN1],
    ["classificationN2", params.classificationsN2],
    ["classificationN3", params.classificationsN3],
    ["classificationN4", params.classificationsN4]
  ];
  for (const [field, values] of selections) {
    if (values?.length && !values.includes(row[field] ?? "")) {
      return false;
    }
  }
  return true;
}

/**
 * Opções dos filtros em CASCATA (TAREFA 4): cada nível só oferece os valores que
 * ainda existem dado o que foi escolhido nos níveis ACIMA dele. O nível corrente
 * não se auto-restringe, senão o usuário não conseguiria marcar um segundo valor.
 */
export function buildClassificationOptions(
  rows: ClassifiableRow[],
  params: PurchaseQueryParams
): PurchaseClassificationOptions {
  const upstream = (upTo: number): ClassifiableRow[] => {
    const selections: Array<[ClassificationField, string[] | undefined]> = [
      ["classificationN1", params.classificationsN1],
      ["classificationN2", params.classificationsN2],
      ["classificationN3", params.classificationsN3],
      ["classificationN4", params.classificationsN4]
    ];
    return rows.filter((row) =>
      selections.slice(0, upTo).every(([field, values]) => !values?.length || values.includes(row[field] ?? ""))
    );
  };

  const toOptions = (slices: PurchaseClassificationSlice[]) =>
    slices
      .map((slice) => ({ value: slice.label, label: `${slice.label} (${slice.count})` }))
      .sort((a, b) => a.value.localeCompare(b.value, "pt-BR"));

  return {
    n1: toOptions(countByLevel(upstream(0), "classificationN1")),
    n2: toOptions(countByLevel(upstream(1), "classificationN2")),
    n3: toOptions(countByLevel(upstream(2), "classificationN3")),
    n4: toOptions(countByLevel(upstream(3), "classificationN4"))
  };
}

/** Bloco completo de análise por classificação das pendências filtradas. */
export function buildClassificationInsights(rows: ClassifiableRow[], available: boolean): PurchaseClassificationInsights {
  const byN1 = countByLevel(rows, "classificationN1");
  const byN2 = countByLevel(rows, "classificationN2");
  const unclassified = rows.filter(
    (row) =>
      !normalizeClassificationLevel(row.classificationN1) &&
      !normalizeClassificationLevel(row.classificationN2) &&
      !normalizeClassificationLevel(row.classificationN3) &&
      !normalizeClassificationLevel(row.classificationN4)
  ).length;

  return {
    available,
    byN1,
    byN2,
    tree: buildClassificationTree(rows),
    topN1: byN1[0] ?? null,
    topN2: byN2[0] ?? null,
    unclassified,
    coverage: {
      n1: rows.filter((row) => normalizeClassificationLevel(row.classificationN1)).length,
      n2: rows.filter((row) => normalizeClassificationLevel(row.classificationN2)).length,
      n3: rows.filter((row) => normalizeClassificationLevel(row.classificationN3)).length,
      n4: rows.filter((row) => normalizeClassificationLevel(row.classificationN4)).length
    }
  };
}

/**
 * A base importada tem ALGUMA classificação? Consulta leve (um `findFirst` por
 * qualquer nível não-nulo) — quando falsa, a UI mostra o aviso da TAREFA 10 em
 * vez de um gráfico zerado sem explicação.
 */
async function hasClassificationData(): Promise<boolean> {
  try {
    const found = await prisma.purchaseRecord.findFirst({
      where: {
        OR: [
          { classificationN1: { not: null } },
          { classificationN2: { not: null } },
          { classificationN3: { not: null } },
          { classificationN4: { not: null } }
        ]
      },
      select: { id: true }
    });
    return Boolean(found);
  } catch (error) {
    console.error("Falha ao verificar a classificação N1..N4 na base de compras.", error);
    return false;
  }
}

function emptyClassificationInsights(): PurchaseClassificationInsights {
  return {
    available: false,
    byN1: [],
    byN2: [],
    tree: [],
    topN1: null,
    topN2: null,
    unclassified: 0,
    coverage: { n1: 0, n2: 0, n3: 0, n4: 0 }
  };
}

function emptyClassificationOptions(): PurchaseClassificationOptions {
  return { n1: [], n2: [], n3: [], n4: [] };
}

/* ------------------------------------------------------------------ */
/* Tempos de processo (mantido — bônus em Realizadas)                 */
/* ------------------------------------------------------------------ */

export async function getPurchaseProcessTimes(params: PurchaseQueryParams = {}): Promise<PurchaseProcessTimes> {
  const base = mergeWhere(buildFilterWhere(params, getTodayDate()), await snapshotWhere(params), { ignored: false });
  const [averages, slowestReqToOrder, slowestTotal] = await Promise.all([
    prisma.purchaseRecord.aggregate({
      where: base,
      _avg: { requisitionToOrderDays: true, orderToReceiptDays: true, migoToMiroDays: true, totalProcessDays: true }
    }),
    prisma.purchaseRecord.findMany({
      where: mergeWhere(base, { requisitionToOrderDays: { not: null } }),
      orderBy: { requisitionToOrderDays: "desc" },
      take: 10,
      select: { id: true, purchaseOrderNumber: true, requisitionNumber: true, supplierName: true, itemDescription: true, requisitionToOrderDays: true }
    }),
    prisma.purchaseRecord.findMany({
      where: mergeWhere(base, { totalProcessDays: { not: null } }),
      orderBy: { totalProcessDays: "desc" },
      take: 10,
      select: { id: true, purchaseOrderNumber: true, requisitionNumber: true, supplierName: true, itemDescription: true, totalProcessDays: true }
    })
  ]);

  const toRank = (
    record: { id: string; purchaseOrderNumber: string | null; requisitionNumber: string | null; supplierName: string | null; itemDescription: string },
    days: number | null
  ): PurchaseProcessRankItem => ({
    id: record.id,
    reference: record.purchaseOrderNumber ?? record.requisitionNumber ?? "—",
    supplierName: record.supplierName,
    itemDescription: record.itemDescription,
    days: days ?? 0
  });

  return {
    averageRequisitionToOrderDays: roundOrNull(averages._avg.requisitionToOrderDays),
    averageOrderToReceiptDays: roundOrNull(averages._avg.orderToReceiptDays),
    averageMigoToMiroDays: roundOrNull(averages._avg.migoToMiroDays),
    averageTotalProcessDays: roundOrNull(averages._avg.totalProcessDays),
    slowestRequisitionToOrder: slowestReqToOrder.map((record) => toRank(record, record.requisitionToOrderDays)),
    slowestTotalProcess: slowestTotal.map((record) => toRank(record, record.totalProcessDays))
  };
}

/* ------------------------------------------------------------------ */
/* Opções de filtro                                                   */
/* ------------------------------------------------------------------ */

export async function getPurchaseFilterOptions(): Promise<PurchaseFilterOptions> {
  const [suppliers, categories, purchasingGroups, requesters, range] = await Promise.all([
    prisma.purchaseRecord.findMany({ where: { supplierName: { not: null } }, select: { supplierName: true }, distinct: ["supplierName"], orderBy: { supplierName: "asc" } }),
    prisma.purchaseRecord.findMany({ where: { goodsGroupCode: { not: null } }, select: { goodsGroupCode: true, goodsGroupDescription: true }, distinct: ["goodsGroupCode"], orderBy: { goodsGroupCode: "asc" } }),
    prisma.purchaseRecord.findMany({ where: { purchasingGroup: { not: null } }, select: { purchasingGroup: true }, distinct: ["purchasingGroup"], orderBy: { purchasingGroup: "asc" } }),
    prisma.purchaseRecord.findMany({ where: { requester: { not: null } }, select: { requester: true }, distinct: ["requester"], orderBy: { requester: "asc" } }),
    prisma.purchaseRecord.aggregate({ _min: { requisitionDate: true, purchaseOrderDate: true }, _max: { requisitionDate: true, purchaseOrderDate: true } })
  ]);

  const minYear = minDate(range._min.purchaseOrderDate, range._min.requisitionDate)?.getUTCFullYear();
  const maxYear = maxDate(range._max.purchaseOrderDate, range._max.requisitionDate)?.getUTCFullYear();
  const years: number[] = [];
  if (minYear && maxYear) {
    for (let year = maxYear; year >= minYear; year -= 1) years.push(year);
  }

  return {
    suppliers: suppliers.map((item) => item.supplierName!).filter(Boolean).map((name) => ({ value: name, label: name })),
    categories: categories
      .filter((item) => item.goodsGroupCode)
      .map((item) => ({ value: item.goodsGroupCode!, label: item.goodsGroupDescription ? `${item.goodsGroupCode} — ${item.goodsGroupDescription}` : item.goodsGroupCode! })),
    purchasingGroups: purchasingGroups.map((item) => item.purchasingGroup!).filter(Boolean).map((group) => ({ value: group, label: group })),
    requesters: requesters.map((item) => item.requester!).filter(Boolean),
    statuses: [
      OS.PENDENTE_COMPRA,
      OS.COMPRADO,
      OS.ATRASADO,
      OS.ENTREGUE,
      OS.REGULARIZACAO,
      OS.SERVICO,
      OS.IGNORADO
    ],
    years
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard principal — assinaturas preservadas                      */
/* ------------------------------------------------------------------ */

/**
 * Quantidade de compras pendentes (KPI do dashboard principal).
 * Usa a MESMA regra v3.1 da aba Compras Pendentes — se divergisse, o card do
 * dashboard e a aba mostrariam números diferentes para o mesmo indicador.
 */
export async function getPendingPurchasesCount(): Promise<number> {
  const today = getTodayDate();
  return prisma.purchaseRecord.count({
    where: mergeWhere(await latestImportWhere(), v31Where("PENDENTE_COMPRA", today))
  });
}

/** Lista de compras pendentes para a tabela do dashboard (regra v3.1). */
export async function getPendingPurchases(limit = 5): Promise<PendingPurchaseData[]> {
  const today = getTodayDate();
  const records = await prisma.purchaseRecord.findMany({
    where: mergeWhere(await latestImportWhere(), v31Where("PENDENTE_COMPRA", today)),
    select: { itemDescription: true, supplierName: true, expectedDeliveryDate: true, netTotal: true, grossTotal: true },
    orderBy: [{ requisitionDate: "asc" }, { requisitionNumber: "asc" }],
    take: limit
  });

  return records.map((record) => ({
    item: record.itemDescription,
    supplier: record.supplierName,
    expectedDate: record.expectedDeliveryDate,
    totalValue: resolvePurchaseValue(record.netTotal, record.grossTotal),
    // Pendente de compra nunca tem pedido, logo nunca é "atrasada" na regra v3.1.
    status: PurchaseStatus.SOLICITADA
  }));
}

/** Total de compras por mês (R$) de um ano — alimenta a aba Compras e o analytics do portal. */
export async function getPurchasesByMonth(year: number): Promise<PurchasesByMonthData[]> {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const records = await prisma.purchaseRecord.findMany({
    // Escopo Y01 (material): exclui ignorados (CódElim L / Bloq / Frete / fornecedor
    // eliminado), serviço (Y0008) e regularização (Y04) — mesmo classificador da
    // aba Compras. Antes só excluía `ignored`, divergindo do KPI/tabela de Compras.
    where: mergeWhere(
      Y01_BASE,
      {
        OR: [
          { purchaseOrderDate: { gte: start, lte: end } },
          { purchaseOrderDate: null, requisitionDate: { gte: start, lte: end } },
          { purchaseOrderDate: null, requisitionDate: null, expectedDeliveryDate: { gte: start, lte: end } }
        ]
      }
    ),
    select: { purchaseOrderDate: true, requisitionDate: true, expectedDeliveryDate: true, netTotal: true, grossTotal: true }
  });

  const totals = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, value: 0 }));
  for (const record of records) {
    const reference = getPurchaseRecordReferenceDate(record);
    if (reference) {
      totals[reference.getUTCMonth()].value += resolvePurchaseValue(record.netTotal, record.grossTotal) ?? 0;
    }
  }
  return totals.map((item) => ({ ...item, value: round(item.value) }));
}

/* ------------------------------------------------------------------ */
/* Orquestradores de página                                           */
/* ------------------------------------------------------------------ */

/**
 * Estado vazio da aba Compras Pendentes. Usado em dois casos: não há compras
 * importadas, ou a consulta ao banco FALHOU. Em ambos, `source: "empty"` sinaliza
 * à UI que não há dado a apresentar — nunca números inventados.
 */
function emptyPendingPurchasesPageData(
  params: PurchaseQueryParams,
  source: PageDataSource = "empty"
): PendingPurchasesPageData {
  return {
    period: resolvePeriodWindow(params),
    kpis: emptyKpis(),
    v31Audit: emptyPurchaseV31Audit(),
    pendingByMonth: [],
    topPendingSuppliers: [],
    pendingByGoodsGroup: [],
    topRequesters: [],
    pendingValue: 0,
    materialsPending: 0,
    requestersPending: 0,
    oldestPendingDate: null,
    classification: emptyClassificationInsights(),
    classificationOptions: emptyClassificationOptions(),
    purchases: emptyPage(params),
    filterOptions: emptyFilterOptions(),
    source
  };
}

/**
 * Aba Compras Pendentes. Uma falha de banco aqui derrubava a página inteira na
 * tela genérica de erro; agora degrada para estado vazio, como já fazem o
 * dashboard e a aba de Ordens de Serviço.
 */
export async function getPendingPurchasesPageData(params: PurchaseQueryParams = {}): Promise<PendingPurchasesPageData> {
  try {
    return await loadPendingPurchasesPageData(params);
  } catch (error) {
    console.error("Falha ao carregar Compras Pendentes pelo banco. Exibindo estado vazio.", error);
    return emptyPendingPurchasesPageData(params, "unavailable");
  }
}

async function loadPendingPurchasesPageData(params: PurchaseQueryParams): Promise<PendingPurchasesPageData> {
  const today = getTodayDate();
  const total = await prisma.purchaseRecord.count();
  const period = resolvePeriodWindow(params);
  if (total === 0) {
    return emptyPendingPurchasesPageData(params);
  }

  // Os filtros N1..N4 são retirados da consulta de ANÁLISE para que as opções em
  // cascata continuem mostrando os irmãos do valor selecionado. O recorte final
  // dos gráficos/cards é aplicado em memória logo abaixo.
  const paramsWithoutClassification: PurchaseQueryParams = {
    ...params,
    classificationsN1: [],
    classificationsN2: [],
    classificationsN3: [],
    classificationsN4: []
  };

  const [kpis, v31Audit, pendingRowsUnfiltered, purchases, filterOptions, classificationAvailable] = await Promise.all([
    getPurchaseSummary(params),
    getPurchaseV31Audit(params, today),
    loadPendingAnalysisRows(paramsWithoutClassification),
    getPendingPurchasesList(params, today),
    getPurchaseFilterOptions(),
    hasClassificationData()
  ]);

  // `pendingRowsUnfiltered` JÁ vem do SQL como `pendente_compra` da regra v3.1 —
  // não há recorte adicional por status aqui, e `Requisição` NÃO é exigida.
  // Recorte final: aplica os filtros N1..N4 — mesma semântica do SQL da tabela.
  const pendingRows = pendingRowsUnfiltered.filter((row) => matchesClassificationFilters(row, params));

  // Agregados dos cards/gráficos — todos sobre o MESMO conjunto filtrado (REGRA 11).
  const pendingValue = round(pendingRows.reduce((sum, row) => sum + valueOf(row), 0));
  const materialsPending = new Set(pendingRows.map((row) => row.materialCode).filter(Boolean)).size;
  const requestersPending = new Set(pendingRows.map((row) => row.requester).filter(Boolean)).size;
  const oldestPendingDate = pendingRows.reduce<Date | null>(
    (oldest, row) => (row.requisitionDate && (!oldest || row.requisitionDate < oldest) ? row.requisitionDate : oldest),
    null
  );

  // Auditoria da REGRA v3.1 (TAREFA 16) — comparável linha a linha com o painel HTML.
  if (process.env.NODE_ENV !== "production") {
    console.debug("[compras-pendentes] auditoria regra v3.1", {
      ...v31Audit,
      totalExibidoEmPendentes: purchases.total,
      totalNaTabelaAposFiltrosN1aN4: pendingRows.length
    });
  }

  return {
    period,
    kpis,
    v31Audit,
    pendingByMonth: bucketByMonth(pendingRows, "requisitionDate"),
    topPendingSuppliers: topSuppliersByCount(pendingRows),
    pendingByGoodsGroup: groupCountByGoodsGroup(pendingRows),
    topRequesters: topRequesters(pendingRows),
    pendingValue,
    materialsPending,
    requestersPending,
    oldestPendingDate: oldestPendingDate ? oldestPendingDate.toISOString() : null,
    classification: buildClassificationInsights(pendingRows, classificationAvailable),
    classificationOptions: buildClassificationOptions(pendingRowsUnfiltered, params),
    purchases,
    filterOptions,
    source: "database"
  };
}

/** Estado vazio da aba Compras Realizadas (sem dados importados OU falha de banco). */
function emptyCompletedPurchasesPageData(
  params: PurchaseQueryParams,
  source: PageDataSource = "empty"
): CompletedPurchasesPageData {
  return {
    period: resolvePeriodWindow(params),
    kpis: emptyKpis(),
    receivedByMonth: [],
    receivedLateByMonth: [],
    topDelayedReceiptSuppliers: [],
    receivedByGoodsGroup: [],
    regularizationByGoodsGroup: [],
    processTimes: emptyProcessTimes(),
    classification: emptyClassificationInsights(),
    classificationOptions: emptyClassificationOptions(),
    purchases: emptyPage(params),
    filterOptions: emptyFilterOptions(),
    source
  };
}

/** Aba Compras Realizadas. Degrada para estado vazio em falha de banco. */
export async function getCompletedPurchasesPageData(params: PurchaseQueryParams = {}): Promise<CompletedPurchasesPageData> {
  try {
    return await loadCompletedPurchasesPageData(params);
  } catch (error) {
    console.error("Falha ao carregar Compras Realizadas pelo banco. Exibindo estado vazio.", error);
    return emptyCompletedPurchasesPageData(params, "unavailable");
  }
}

async function loadCompletedPurchasesPageData(params: PurchaseQueryParams): Promise<CompletedPurchasesPageData> {
  const today = getTodayDate();
  const total = await prisma.purchaseRecord.count();
  const period = resolvePeriodWindow(params);
  if (total === 0) {
    return emptyCompletedPurchasesPageData(params);
  }

  // Mesma decisão da aba Pendentes: os filtros N1..N4 saem da consulta de
  // ANÁLISE para que as opções em cascata continuem oferecendo os irmãos do
  // valor selecionado. O recorte final é aplicado em memória logo abaixo.
  const paramsWithoutClassification: PurchaseQueryParams = {
    ...params,
    classificationsN1: [],
    classificationsN2: [],
    classificationsN3: [],
    classificationsN4: []
  };

  const [
    kpis,
    receivedRows,
    regularizationRows,
    completedRowsUnfiltered,
    processTimes,
    purchases,
    filterOptions,
    classificationAvailable
  ] = await Promise.all([
    getPurchaseSummary(params),
    loadCompletedAnalysisRows(params),
    loadRegularizationRows(params),
    loadCompletedTableRows(paramsWithoutClassification),
    getPurchaseProcessTimes(params),
    getCompletedPurchasesList(params, today),
    getPurchaseFilterOptions(),
    hasClassificationData()
  ]);

  const lateReceived = receivedRows.filter((row) => row.isLateReceived);
  // Recorte final da análise N1..N4 — mesma semântica do SQL da tabela.
  const completedRows = completedRowsUnfiltered.filter((row) => matchesClassificationFilters(row, params));

  return {
    period,
    kpis,
    receivedByMonth: bucketByMonth(receivedRows, "receiptDate"),
    receivedLateByMonth: bucketByMonth(lateReceived, "receiptDate"),
    topDelayedReceiptSuppliers: topSuppliersByCount(lateReceived),
    receivedByGoodsGroup: groupCountByGoodsGroup(receivedRows),
    regularizationByGoodsGroup: groupCountByGoodsGroup(regularizationRows),
    processTimes,
    classification: buildClassificationInsights(completedRows, classificationAvailable),
    classificationOptions: buildClassificationOptions(completedRowsUnfiltered, params),
    purchases,
    filterOptions,
    source: "database"
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function resolvePeriodWindow(params: PurchaseQueryParams): { startDate: string; endDate: string } {
  return { startDate: params.startDate ?? "", endDate: params.endDate ?? "" };
}

function clampPageSize(value?: number): number {
  const allowed = [25, 50, 100];
  return value && allowed.includes(value) ? value : DEFAULT_PAGE_SIZE;
}

function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : round(value);
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function emptyKpis(): PurchaseKpis {
  return {
    totalRecords: 0,
    baseY01: 0,
    purchased: 0,
    purchasedValue: 0,
    purchasedNotDelivered: 0,
    pendingPurchase: 0,
    pendingValue: 0,
    inTransit: 0,
    late: 0,
    lateValue: 0,
    delivered: 0,
    deliveredValue: 0,
    deliveredLate: 0,
    regularizations: 0,
    regularizationsDelivered: 0,
    services: 0,
    servicesDelivered: 0,
    ignored: 0,
    totalValue: 0
  };
}

function emptyPage(params: PurchaseQueryParams): PaginatedPurchases {
  return { data: [], total: 0, page: Math.max(1, params.page ?? 1), pageSize: clampPageSize(params.pageSize), totalPages: 1 };
}

function emptyProcessTimes(): PurchaseProcessTimes {
  return {
    averageRequisitionToOrderDays: null,
    averageOrderToReceiptDays: null,
    averageMigoToMiroDays: null,
    averageTotalProcessDays: null,
    slowestRequisitionToOrder: [],
    slowestTotalProcess: []
  };
}

function emptyFilterOptions(): PurchaseFilterOptions {
  return { suppliers: [], categories: [], purchasingGroups: [], requesters: [], statuses: [], years: [] };
}

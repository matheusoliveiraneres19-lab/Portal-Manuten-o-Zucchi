/**
 * ANÁLISE MRP — execução do motor (FASE D).
 *
 *   runMrpAnalysis({ baseVersionId?, stockImportId, purchaseImportId, depositFilter?, trigger, userId })
 *     1. valida as três fontes (base, estoque, compras);
 *     2. carrega materiais, saldos e compras em 3 consultas (+3 das fontes);
 *     3. roda o motor PURO (src/lib/mrp/analysis-engine.ts) em memória;
 *     4. numa transação: cria MrpAnalysisRun + itens (createMany em lotes) e
 *        troca a análise vigente (isCurrent) — falhou, a anterior continua.
 *
 * Cada execução é um snapshot imutável: rodar de novo cria OUTRO run. As regras
 * de negócio NÃO moram aqui (nem em telas): só no motor puro.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  analyzeMrp,
  countMrp,
  orderMrpBaseMaterials,
  purchaseKpis,
  removedFromMrp,
  type MrpAnalysisResult,
  type MrpCounts,
  type MrpEngineMaterial,
  type MrpEnginePurchase
} from "@/lib/mrp/analysis-engine";
import { outputNumber } from "@/lib/mrp/mrp-math";
import {
  MRP_RUN_TRIGGERS,
  MrpPersistenceError,
  fromMrpDecimal,
  getActiveMrpBaseVersion,
  setCurrentMrpAnalysisRun,
  toMrpDecimal,
  type MrpRunTrigger
} from "@/services/mrp-persistence.service";

const ITEM_BATCH = 1000;
const TX_OPTIONS = { maxWait: 15_000, timeout: 180_000 } as const;

export type MrpAnalysisKpis = MrpCounts & {
  /** "Saíram do MRP": materiais com status final Comprado. */
  removedFromMrp: number;
  /** Soma de suggestedOriginal desses materiais. */
  avoidedQty: number;
  /** KPIs da aba Em trânsito (pela ÚLTIMA compra de cada material). */
  purchases: ReturnType<typeof purchaseKpis>;
};

export type MrpRunMetrics = {
  materials: number;
  stockItems: number;
  purchaseItems: number;
  /** Consultas ao banco feitas pela execução (leituras + escritas). */
  queries: number;
  loadMs: number;
  engineMs: number;
  persistMs: number;
  totalMs: number;
};

export type RunMrpAnalysisParams = {
  baseVersionId?: string;
  stockImportId: string;
  purchaseImportId: string;
  /** Opcional; se informado, tem de ser o depósito usado na importação do estoque. */
  depositFilter?: string;
  trigger: MrpRunTrigger;
  userId: string | null;
  /** Só para testes: roda dentro da transação, antes do commit. */
  hooks?: { beforeCommit?: (tx: Prisma.TransactionClient) => Promise<void> };
};

export type RunMrpAnalysisResult = {
  runId: string;
  baseVersionId: string;
  stockImportId: string;
  purchaseImportId: string;
  depositFilter: string;
  trigger: MrpRunTrigger;
  kpis: MrpAnalysisKpis;
  metrics: MrpRunMetrics;
  createdAt: Date;
};

/** Carrega as fontes e devolve as entradas do motor (sem gravar nada). */
export async function loadMrpAnalysisInputs(params: { baseVersionId?: string; stockImportId: string; purchaseImportId: string }) {
  let queries = 0;
  const q = <T,>(p: Promise<T>) => {
    queries++;
    return p;
  };

  const base = params.baseVersionId
    ? await q(prisma.mrpBaseVersion.findUnique({ where: { id: params.baseVersionId } }))
    : await q(getActiveMrpBaseVersion());
  if (!base) {
    throw new MrpPersistenceError(params.baseVersionId ? `Base MRP não encontrada: ${params.baseVersionId}` : "Não há Base MRP vigente.");
  }
  const stockImport = await q(prisma.mrpStockImport.findUnique({ where: { id: params.stockImportId } }));
  if (!stockImport) throw new MrpPersistenceError(`Importação de estoque não encontrada: ${params.stockImportId}`);
  const purchaseImport = await q(prisma.mrpPurchaseImport.findUnique({ where: { id: params.purchaseImportId } }));
  if (!purchaseImport) throw new MrpPersistenceError(`Importação de compras não encontrada: ${params.purchaseImportId}`);

  const [baseRows, stockRows, purchaseRows] = [
    await q(prisma.mrpBaseMaterial.findMany({ where: { versionId: base.id } })),
    await q(prisma.mrpStockItem.findMany({ where: { importId: stockImport.id }, select: { code: true, freeQty: true } })),
    await q(prisma.mrpPurchaseItem.findMany({ where: { importId: purchaseImport.id }, orderBy: { seq: "asc" } }))
  ];
  if (baseRows.length !== base.materialCount) {
    throw new MrpPersistenceError(`Base MRP ${base.id} incompleta (${baseRows.length} de ${base.materialCount}).`);
  }

  // Ordem de materiais(): ordem das abas da versão + linha de origem.
  const sheetOrder = Array.isArray(base.sheets) ? (base.sheets as { name?: string }[]).map((s) => String(s?.name ?? "")) : [];
  const materials: MrpEngineMaterial[] = orderMrpBaseMaterials(baseRows, sheetOrder).map((m) => ({
    code: m.code,
    description: m.description,
    group: m.group,
    unit: m.unit,
    area: m.area,
    family: m.family,
    min: fromMrpDecimal(m.min),
    max: fromMrpDecimal(m.max),
    statusMrp: m.statusMrp
  }));
  const stock = new Map<string, number>(stockRows.map((s) => [s.code, fromMrpDecimal(s.freeQty)]));
  const purchases: MrpEnginePurchase[] = purchaseRows.map((p) => ({
    seq: p.seq,
    code: p.code,
    text: p.text,
    quantity: fromMrpDecimal(p.quantity),
    requisitionDate: p.requisitionDate,
    requisitionNumber: p.requisitionNumber,
    purchaseOrderNumber: p.purchaseOrderNumber,
    receiptDate: p.receiptDate,
    expectedDeliveryDate: p.expectedDeliveryDate,
    supplier: p.supplier
  }));

  return { base, stockImport, purchaseImport, materials, stock, purchases, queries };
}

/** KPIs do run (contar + Saíram do MRP + compras), com -0 normalizado para saída. */
export function buildMrpAnalysisKpis(results: MrpAnalysisResult[], purchases: MrpEnginePurchase[]): MrpAnalysisKpis {
  const counts = countMrp(results);
  const removed = removedFromMrp(results);
  const out = {
    ...counts,
    removedFromMrp: removed.count,
    avoidedQty: removed.avoidedQty,
    purchases: purchaseKpis(purchases)
  };
  for (const k of ["qtd", "qtdTransito", "qtdParada", "avoidedQty"] as const) out[k] = outputNumber(out[k]);
  out.purchases.qtdPendente = outputNumber(out.purchases.qtdPendente);
  return out;
}

function itemRow(runId: string, position: number, a: MrpAnalysisResult): Prisma.MrpAnalysisItemCreateManyInput {
  return {
    runId,
    position,
    code: a.code,
    description: a.description,
    group: a.group,
    unit: a.unit,
    area: a.area,
    family: a.family,
    min: toMrpDecimal(a.min),
    max: toMrpDecimal(a.max),
    free: toMrpDecimal(a.free),
    notFound: a.notFound,
    noParams: a.noParams,
    noMovement: a.noMovement,
    status: a.status,
    statusOriginal: a.statusOriginal,
    suggested: toMrpDecimal(a.suggested),
    suggestedOriginal: toMrpDecimal(a.suggestedOriginal),
    missing: toMrpDecimal(a.missing),
    purchaseQty: a.purchase ? toMrpDecimal(a.purchase.qty) : null,
    purchaseOrder: a.purchase ? a.purchase.order : null,
    purchaseRequisition: a.purchase ? a.purchase.requisition : null,
    purchaseForecast: a.purchase ? a.purchase.forecast : null,
    purchaseSupplier: a.purchase ? a.purchase.supplier : null,
    purchaseDate: a.purchase ? a.purchase.date : null
  };
}

/** Executa a análise e torna o novo run a análise vigente (transação). */
export async function runMrpAnalysis(params: RunMrpAnalysisParams): Promise<RunMrpAnalysisResult> {
  if (!(MRP_RUN_TRIGGERS as readonly string[]).includes(params.trigger)) {
    throw new MrpPersistenceError(`Gatilho inválido: ${String(params.trigger)}`);
  }
  const t0 = Date.now();
  const inputs = await loadMrpAnalysisInputs(params);
  const { base, stockImport, purchaseImport, materials, stock, purchases } = inputs;

  // O depósito é aplicado na IMPORTAÇÃO do estoque; o run só registra qual foi.
  if (params.depositFilter !== undefined && params.depositFilter.trim() !== stockImport.depositFilter) {
    throw new MrpPersistenceError(
      `O estoque ${stockImport.id} foi importado com o depósito "${stockImport.depositFilter || "todos"}"; ` +
        `para analisar o depósito "${params.depositFilter || "todos"}", importe o estoque com esse filtro.`
    );
  }

  const t1 = Date.now();
  const results = analyzeMrp(materials, stock, purchases);
  const kpis = buildMrpAnalysisKpis(results, purchases);
  const t2 = Date.now();

  let queries = inputs.queries;
  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.mrpAnalysisRun.create({
      data: {
        baseVersionId: base.id,
        stockImportId: stockImport.id,
        purchaseImportId: purchaseImport.id,
        depositFilter: stockImport.depositFilter,
        trigger: params.trigger,
        kpis: kpis as unknown as Prisma.InputJsonValue,
        isCurrent: false,
        createdBy: params.userId
      }
    });
    queries++;
    for (let i = 0; i < results.length; i += ITEM_BATCH) {
      await tx.mrpAnalysisItem.createMany({
        data: results.slice(i, i + ITEM_BATCH).map((a, k) => itemRow(created.id, i + k, a))
      });
      queries++;
    }
    const written = await tx.mrpAnalysisItem.count({ where: { runId: created.id } });
    queries++;
    if (written !== results.length || written !== base.materialCount) {
      throw new MrpPersistenceError(`Análise incompleta: ${written} itens gravados de ${results.length}.`);
    }
    await setCurrentMrpAnalysisRun(created.id, tx);
    queries += 5; // findUnique + updateMany + update + count + findUniqueOrThrow
    if (params.hooks?.beforeCommit) await params.hooks.beforeCommit(tx);
    return created;
  }, TX_OPTIONS);
  const t3 = Date.now();

  const metrics: MrpRunMetrics = {
    materials: materials.length,
    stockItems: stock.size,
    purchaseItems: purchases.length,
    queries,
    loadMs: t1 - t0,
    engineMs: t2 - t1,
    persistMs: t3 - t2,
    totalMs: t3 - t0
  };
  console.info(
    `[MRP_ANALYSIS_RUN] run=${run.id} trigger=${params.trigger} materiais=${metrics.materials} estoque=${metrics.stockItems} ` +
      `compras=${metrics.purchaseItems} consultas=${metrics.queries} carga=${metrics.loadMs}ms motor=${metrics.engineMs}ms ` +
      `gravação=${metrics.persistMs}ms total=${metrics.totalMs}ms`
  );

  return {
    runId: run.id,
    baseVersionId: base.id,
    stockImportId: stockImport.id,
    purchaseImportId: purchaseImport.id,
    depositFilter: stockImport.depositFilter,
    trigger: params.trigger,
    kpis,
    metrics,
    createdAt: run.createdAt
  };
}

/** Análise vigente com KPIs e fontes — sem os itens. */
export async function getCurrentMrpAnalysisSummary() {
  const run = await prisma.mrpAnalysisRun.findFirst({
    where: { isCurrent: true },
    include: {
      baseVersion: { select: { id: true, fileName: true, source: true, materialCount: true, isActive: true, activatedAt: true } },
      stockImport: { select: { id: true, fileName: true, sheet: true, depositFilter: true, depositInfo: true, rowsAccepted: true, createdAt: true } },
      purchaseImport: { select: { id: true, fileName: true, sheet: true, rowsAccepted: true, createdAt: true } },
      _count: { select: { items: true } }
    }
  });
  if (!run) return null;
  return {
    runId: run.id,
    trigger: run.trigger,
    depositFilter: run.depositFilter,
    kpis: run.kpis as unknown as MrpAnalysisKpis,
    items: run._count.items,
    createdAt: run.createdAt,
    createdBy: run.createdBy,
    sources: { base: run.baseVersion, stock: run.stockImport, purchases: run.purchaseImport }
  };
}

/** Itens de um run na ordem de materiais() (consumo das futuras telas/exportações). */
export async function getMrpAnalysisItems(runId: string) {
  const rows = await prisma.mrpAnalysisItem.findMany({ where: { runId }, orderBy: { position: "asc" } });
  return rows.map(mrpAnalysisItemToResult);
}

/** Linha do banco -> MrpAnalysisResult (números exatos; -0 já sai como 0). */
export function mrpAnalysisItemToResult(r: Prisma.MrpAnalysisItemGetPayload<object>): MrpAnalysisResult {
  return {
    code: r.code,
    description: r.description,
    group: r.group,
    unit: r.unit,
    area: r.area,
    family: r.family,
    min: fromMrpDecimal(r.min),
    max: fromMrpDecimal(r.max),
    free: fromMrpDecimal(r.free),
    notFound: r.notFound,
    noParams: r.noParams,
    noMovement: r.noMovement,
    status: r.status as MrpAnalysisResult["status"],
    suggested: fromMrpDecimal(r.suggested),
    missing: fromMrpDecimal(r.missing),
    purchase:
      r.purchaseQty === null
        ? null
        : {
            qty: fromMrpDecimal(r.purchaseQty),
            order: r.purchaseOrder ?? "",
            requisition: r.purchaseRequisition ?? "",
            forecast: r.purchaseForecast ?? "",
            supplier: r.purchaseSupplier ?? "",
            date: r.purchaseDate ?? ""
          },
    statusOriginal: r.statusOriginal as MrpAnalysisResult["statusOriginal"],
    suggestedOriginal: fromMrpDecimal(r.suggestedOriginal)
  };
}

/**
 * ANÁLISE MRP — motor (FASE D), porta 1:1 de `analisar()`, `pendentes()`,
 * `obsDe()` e `contar()` do `Analise_MRP_Compacto (1).html`.
 *
 * ÚNICO lugar onde as regras Comprar / Verificar / OK / Comprado, quantidade
 * sugerida, faltante, sem movimentação e última compra existem. Telas e
 * exportações consomem o resultado (MrpAnalysisItem) e estes helpers — nunca
 * recalculam.
 *
 * Regras (todas do HTML, inclusive as peculiaridades):
 *   - universo = materiais da BASE MRP, na ordem de materiais(); material só no
 *     estoque não entra;
 *   - saldo = utilização livre do estoque; ausente = 0 e notFound;
 *   - semParam = min <= 0 && max <= 0;
 *   - status: semParam -> OK; livre <= 0 -> Comprar; livre < min -> Verificar; senão OK
 *     (min = 0, max > 0, livre > 0 -> OK);
 *   - sugerida = semParam ? 0 : max(0, (max > 0 ? max : min) - livre) — calculada
 *     TAMBÉM para OK (min 10, máx 20, saldo 15 -> OK com sugerida 5);
 *   - semMov = semParam || isSemMovTxt(statusMrp);
 *   - última compra (cmpOrdem) pendente: preenche a compra em QUALQUER status;
 *     só Comprar/Verificar viram Comprado, com sugerida 0 e
 *     falta = max(0, sugeridaOriginal - qtd). OK continua OK, com a sugerida.
 */
import { isSemMovTxt } from "./classification";
import { dataBR } from "./date-parser";
import { lessThan, lteZero, maxZero, subtract } from "./mrp-math";
import { buildMrpPurchaseIndex, type MrpPurchaseGroup, type MrpPurchaseRecord } from "./purchase-parser";

export type MrpAnalysisStatus = "Comprar" | "Verificar" | "Comprado" | "OK";
export const MRP_ANALYSIS_STATUSES: MrpAnalysisStatus[] = ["Comprar", "Verificar", "Comprado", "OK"];

/** Material da Base MRP (um registro de materiais()). */
export type MrpEngineMaterial = {
  code: string;
  description: string;
  group: string;
  unit: string;
  area: string;
  family: string;
  min: number;
  max: number;
  statusMrp: string;
};

/** Linha de compra mínima para o índice (MrpPurchaseRecord sem sourceRow). */
export type MrpEnginePurchase = Omit<MrpPurchaseRecord, "sourceRow">;

/** `rec.compra` — dados da ÚLTIMA compra pendente. */
export type MrpPendingPurchase = {
  /** u.qtd || 0 */
  qty: number;
  /** u.pedido */
  order: string;
  /** u.requisicao */
  requisition: string;
  /** u.previsao */
  forecast: string;
  /** u.fornecedor */
  supplier: string;
  /** u.dataReq */
  date: string;
};

/** Um elemento de `analysis`. */
export type MrpAnalysisResult = {
  code: string;
  description: string;
  group: string;
  unit: string;
  area: string;
  family: string;
  min: number;
  max: number;
  /** livre */
  free: number;
  /** naoEnc */
  notFound: boolean;
  /** semParam */
  noParams: boolean;
  /** semMov */
  noMovement: boolean;
  status: MrpAnalysisStatus;
  /** sugerida */
  suggested: number;
  /** falta */
  missing: number;
  purchase: MrpPendingPurchase | null;
  /** statusOrig */
  statusOriginal: MrpAnalysisStatus;
  /** sugeridaOrig */
  suggestedOriginal: number;
};

/** `pendentes()` — só materiais cuja ÚLTIMA compra está pendente. */
export function buildMrpPendingIndex<T extends MrpEnginePurchase>(
  index: Map<string, MrpPurchaseGroup<T>>
): Map<string, MrpPurchaseGroup<T>> {
  const out = new Map<string, MrpPurchaseGroup<T>>();
  for (const [code, g] of Array.from(index.entries())) if (g.status === "pend") out.set(code, g);
  return out;
}

/**
 * `analisar()` — um resultado por material da base, na ordem da base.
 * `stock`: saldo por código (1 por código, a 1ª ocorrência — FASE C).
 */
export function analyzeMrp(
  materials: readonly MrpEngineMaterial[],
  stock: ReadonlyMap<string, number>,
  purchases: readonly MrpEnginePurchase[]
): MrpAnalysisResult[] {
  // Índice montado UMA vez (ordenação por cmpOrdem por material).
  const pend = buildMrpPendingIndex(buildMrpPurchaseIndex(purchases));
  return materials.map((m) => {
    const tem = stock.has(m.code);
    const livre = tem ? stock.get(m.code)! : 0;
    const semParam = lteZero(m.min) && lteZero(m.max);
    const status: MrpAnalysisStatus = semParam ? "OK" : lteZero(livre) ? "Comprar" : lessThan(livre, m.min) ? "Verificar" : "OK";
    const sug = semParam ? 0 : maxZero(subtract(m.max > 0 ? m.max : m.min, livre));
    const rec: MrpAnalysisResult = {
      code: m.code,
      description: m.description,
      group: m.group,
      unit: m.unit,
      area: m.area,
      family: m.family,
      min: m.min,
      max: m.max,
      free: livre,
      notFound: !tem,
      noParams: semParam,
      noMovement: semParam || isSemMovTxt(m.statusMrp),
      status,
      suggested: sug,
      missing: 0,
      purchase: null,
      statusOriginal: status,
      suggestedOriginal: sug
    };
    const g = pend.get(m.code);
    if (g) {
      const u = g.last;
      rec.purchase = {
        qty: u.quantity || 0,
        order: u.purchaseOrderNumber,
        requisition: u.requisitionNumber,
        forecast: u.expectedDeliveryDate,
        supplier: u.supplier,
        date: u.requisitionDate
      };
      if (status === "Comprar" || status === "Verificar") {
        rec.status = "Comprado";
        rec.suggested = 0;
        rec.missing = maxZero(subtract(sug, u.quantity || 0));
      }
    }
    return rec;
  });
}

/* -------------------------------------------------------------------------- */
/*  obsDe                                                                      */
/* -------------------------------------------------------------------------- */

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
/** `fmt()` do HTML. */
export const fmtMrp = (v: number | null | undefined): string => nf.format(v || 0);

type ObsInput = Pick<MrpAnalysisResult, "status" | "notFound" | "noParams" | "free" | "min" | "missing" | "unit"> & {
  purchase: Pick<MrpPendingPurchase, "qty" | "order" | "requisition" | "forecast"> | null;
};

/** `obsDe()` — observação da situação do material. */
export function mrpObservation(a: ObsInput): string {
  if (a.status === "Comprado") {
    const c = a.purchase!;
    const ref = c.order ? "pedido " + c.order : "requisição " + c.requisition;
    return (
      ref +
      " · " +
      fmtMrp(c.qty) +
      (a.unit ? " " + a.unit : "") +
      (c.forecast ? " · previsão " + dataBR(c.forecast) : "") +
      (a.missing > 0 ? " · faltam " + fmtMrp(a.missing) : "")
    );
  }
  if (a.status === "Comprar") return a.notFound ? "Zerado (não consta no estoque enviado)" : "Material zerado";
  if (a.status === "Verificar") return "Abaixo do mínimo (" + fmtMrp(a.free) + " de " + fmtMrp(a.min) + ")";
  if (a.noParams) return "Sem mín/máx no MRP";
  return "";
}

/* -------------------------------------------------------------------------- */
/*  contar + KPIs                                                              */
/* -------------------------------------------------------------------------- */

/** `contar()` */
export type MrpCounts = {
  total: number;
  Comprar: number;
  Verificar: number;
  Comprado: number;
  OK: number;
  /** soma de `suggested` de TODOS os materiais (inclusive OK). */
  qtd: number;
  /** soma de purchase.qty dos Comprado. */
  qtdTransito: number;
  semMov: number;
  /** semMov com saldo > 0 (capital parado). */
  parado: number;
  /** soma do saldo dos `parado`. */
  qtdParada: number;
};

type CountInput = Pick<MrpAnalysisResult, "status" | "suggested" | "noMovement" | "free"> & { purchase: { qty: number } | null };

export function countMrp(rows: readonly CountInput[]): MrpCounts {
  const c: MrpCounts = { total: 0, Comprar: 0, Verificar: 0, Comprado: 0, OK: 0, qtd: 0, qtdTransito: 0, semMov: 0, parado: 0, qtdParada: 0 };
  for (const a of rows) {
    c.total++;
    c[a.status] = (c[a.status] || 0) + 1;
    c.qtd += a.suggested;
    if (a.status === "Comprado") c.qtdTransito += a.purchase ? a.purchase.qty : 0;
    if (a.noMovement) {
      c.semMov++;
      if (a.free > 0) {
        c.parado++;
        c.qtdParada += a.free;
      }
    }
  }
  return c;
}

/**
 * KPI "Saíram do MRP" (aba Em trânsito): materiais com status final Comprado e a
 * quantidade evitada = soma de suggestedOriginal deles (suggested já está 0).
 */
export function removedFromMrp(rows: readonly Pick<MrpAnalysisResult, "status" | "suggestedOriginal">[]): {
  count: number;
  avoidedQty: number;
} {
  const retirados = rows.filter((a) => a.status === "Comprado");
  return { count: retirados.length, avoidedQty: retirados.reduce((s, a) => s + a.suggestedOriginal, 0) };
}

/** Capital parado / zerado (derivado, sem coluna própria). */
export function mrpIdleKind(a: Pick<MrpAnalysisResult, "noMovement" | "free">): "CAPITAL_PARADO" | "ZERADO" | null {
  if (!a.noMovement) return null;
  return a.free > 0 ? "CAPITAL_PARADO" : "ZERADO";
}

/**
 * KPIs de compras da aba Em trânsito (renderTransito): linhas, materiais,
 * pendentes/recebidos pela ÚLTIMA compra e quantidade pendente.
 */
export function purchaseKpis(purchases: readonly MrpEnginePurchase[]) {
  const groups = Array.from(buildMrpPurchaseIndex(purchases).values());
  const pend = groups.filter((g) => g.status === "pend");
  return {
    linhas: purchases.length,
    materiais: groups.length,
    pendentes: pend.length,
    recebidos: groups.filter((g) => g.status === "rec").length,
    semPedido: groups.filter((g) => g.status === "sem").length,
    qtdPendente: pend.reduce((s, g) => s + (g.last.quantity || 0), 0)
  };
}

/**
 * Ordem de materiais(): ordem das abas em MrpBaseVersion.sheets e, dentro da
 * aba, a linha de origem. Necessária para desempates (sort estável) e somas.
 */
export function orderMrpBaseMaterials<T extends { sourceSheet: string | null; sourceRow: number | null }>(
  materials: readonly T[],
  sheetOrder: readonly string[]
): T[] {
  const pos = new Map(sheetOrder.map((name, i) => [name, i]));
  return [...materials].sort(
    (a, b) =>
      (pos.get(a.sourceSheet ?? "") ?? Number.MAX_SAFE_INTEGER) - (pos.get(b.sourceSheet ?? "") ?? Number.MAX_SAFE_INTEGER) ||
      (a.sourceRow ?? 0) - (b.sourceRow ?? 0)
  );
}

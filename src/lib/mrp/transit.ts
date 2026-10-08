/**
 * ANÁLISE MRP — aba EM TRÂNSITO (FASE G), porta 1:1 de `renderTransito()` do
 * `Analise_MRP_Compacto (1).html`.
 *
 * Fonte: as compras da importação USADA PELO RUN (todas, inclusive de materiais
 * fora da Base MRP), agrupadas por código com o MESMO comprasIndex() da FASE C
 * (última compra = maior cmpOrdem; status = cmpStatus da última). Os itens da
 * análise só servem para descrição, área e o filtro "Só materiais da base MRP".
 */
import { buildMrpPurchaseIndex, type MrpPurchaseStatus } from "./purchase-parser";
import type { MrpEnginePurchase } from "./analysis-engine";
import { norm } from "./normalization";

export const MRP_TRANSIT_STATUS_FILTERS = ["pend", "rec", "sem", "all"] as const;
export type MrpTransitStatusFilter = (typeof MRP_TRANSIT_STATUS_FILTERS)[number];

export const MRP_TRANSIT_STATUS_LABELS: Record<MrpTransitStatusFilter, string> = {
  pend: "Em trânsito (não entregue)",
  rec: "Recebidos",
  sem: "Sem pedido / requisição",
  all: "Todos"
};

export const MRP_TRANSIT_SITUATION: Record<MrpPurchaseStatus, string> = { pend: "Em trânsito", rec: "Recebido", sem: "Sem pedido" };

export type MrpTransitFilters = { q: string; status: MrpTransitStatusFilter; onlyMrp: boolean };
export const MRP_TRANSIT_DEFAULT_FILTERS: MrpTransitFilters = { q: "", status: "pend", onlyMrp: false };

export function isMrpTransitStatus(v: unknown): v is MrpTransitStatusFilter {
  return typeof v === "string" && (MRP_TRANSIT_STATUS_FILTERS as readonly string[]).includes(v);
}

/** Filtros da aba na URL — nomes próprios, para não colidir com os da aba Comprar. */
export function parseMrpTransitFilters(get: (key: string) => string | null | undefined): MrpTransitFilters {
  const status = get("transitStatus");
  return {
    q: (get("transitQ") ?? "").slice(0, 200),
    status: isMrpTransitStatus(status) ? status : "pend",
    onlyMrp: get("transitMrp") === "1"
  };
}

/** Um grupo de `comprasIndex()` pronto para a tabela. */
export type MrpTransitGroup = {
  code: string;
  /** `g.n` */
  count: number;
  /** Posição da 1ª aparição do código nas compras (ordem do Map do HTML). */
  firstSeq: number;
  status: MrpPurchaseStatus;
  /** Está entre os materiais da análise (Base MRP do run)? */
  inBase: boolean;
  /** `(m && m.descricao) || u.texto` */
  description: string;
  /** Área do material na análise ("" fora da base). */
  area: string;
  /** Campos da ÚLTIMA compra (`g.ultima`). */
  quantity: number;
  text: string;
  supplier: string;
  purchaseOrderNumber: string;
  requisitionNumber: string;
  requisitionDate: string;
  expectedDeliveryDate: string;
  receiptDate: string;
};

export type MrpTransitAnalysisLookup = ReadonlyMap<string, { description: string; area: string }>;

/** `comprasIndex()` + dados de exibição, na ordem de 1ª aparição de cada código. */
export function buildMrpTransitGroups(purchases: readonly MrpEnginePurchase[], analysis: MrpTransitAnalysisLookup): MrpTransitGroup[] {
  const firstSeq = new Map<string, number>();
  purchases.forEach((p, i) => {
    if (p.code && !firstSeq.has(p.code)) firstSeq.set(p.code, i);
  });
  return Array.from(buildMrpPurchaseIndex(purchases).values()).map((g) => {
    const u = g.last;
    const m = analysis.get(g.code);
    return {
      code: g.code,
      count: g.count,
      firstSeq: firstSeq.get(g.code) ?? 0,
      status: g.status,
      inBase: !!m,
      description: (m && m.description) || u.text,
      area: m ? m.area : "",
      quantity: u.quantity,
      text: u.text,
      supplier: u.supplier,
      purchaseOrderNumber: u.purchaseOrderNumber,
      requisitionNumber: u.requisitionNumber,
      requisitionDate: u.requisitionDate,
      expectedDeliveryDate: u.expectedDeliveryDate,
      receiptDate: u.receiptDate
    };
  });
}

/**
 * Filtro + ordenação da tabela (renderTransito): status da última compra,
 * "Só materiais da base MRP", busca em norm(código / texto / fornecedor) da
 * última compra; ordem = data da requisição DESC (localeCompare, "" por último),
 * empates na ordem de 1ª aparição (sort estável).
 */
export function filterMrpTransit<T extends MrpTransitGroup>(groups: readonly T[], f: MrpTransitFilters): T[] {
  const q = norm(f.q);
  const st = f.status === "all" ? "" : f.status;
  return groups
    .filter((g) => {
      if (st && g.status !== st) return false;
      if (f.onlyMrp && !g.inBase) return false;
      if (q && !(norm(g.code).includes(q) || norm(g.text).includes(q) || norm(g.supplier).includes(q))) return false;
      return true;
    })
    .sort((a, b) => (b.requisitionDate || "").localeCompare(a.requisitionDate || "") || a.firstSeq - b.firstSeq);
}

/** Pedido tem prioridade sobre a requisição (`u.pedido || u.requisicao`). */
export const mrpTransitRef = (g: Pick<MrpTransitGroup, "purchaseOrderNumber" | "requisitionNumber">) => g.purchaseOrderNumber || g.requisitionNumber || "";

export const MRP_TRANSIT_INITIAL_LIMIT = 200;
export const MRP_TRANSIT_LIMIT_STEP = 400;

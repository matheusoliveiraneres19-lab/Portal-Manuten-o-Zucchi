/**
 * ANÁLISE MRP — exportações Excel (FASE J), porta 1:1 do bloco EXPORTAÇÕES do
 * `Analise_MRP_Compacto (1).html`: HDR/COLW, `linha()`, `sheet()`,
 * `exportCompra(false|true)`, `exportConjuntos()`, `exportParado()`,
 * `exportTransito()`, `exportBase()` e `dateStamp()`.
 *
 * Só monta o conteúdo (abas, linhas = array de arrays, larguras `wch`). A
 * gravação do .xlsx fica em `export-workbook.ts` (servidor). Os recortes já
 * chegam prontos dos módulos validados: filterMrpBuyList (= filtrarCompra()),
 * filterMrpIdle (= paradoRows()), buildMrpTransitGroups (= comprasIndex()),
 * filterMrpBase (= baseFiltrada()).
 */
import type { MrpAnalysisStatus } from "./analysis-engine";
import { MRP_AREA_ELE, MRP_AREA_MEC, MRP_FAMILIES } from "./classification";
import { dataBR } from "./date-parser";
import type { MrpBaseViewRow } from "./base-view";
import type { MrpTransitGroup } from "./transit";

export const MRP_EXPORT_TYPES = ["buy", "buy-by-area", "families", "idle", "transit", "base"] as const;
export type MrpExportType = (typeof MRP_EXPORT_TYPES)[number];
export const isMrpExportType = (v: unknown): v is MrpExportType => typeof v === "string" && (MRP_EXPORT_TYPES as readonly string[]).includes(v);

export type MrpExportCell = string | number;
export type MrpExportSheet = { name: string; rows: MrpExportCell[][]; cols: { wch: number }[] };
export type MrpExportSpec = { baseName: string; sheets: MrpExportSheet[] };
export type MrpExportResult = { ok: true; spec: MrpExportSpec } | { ok: false; message: string };

/** HDR / COLW do HTML (lista, por área, conjuntos e estoque parado). */
export const MRP_EXPORT_HDR = ["Código", "Descrição", "Área", "Conjunto", "Grupo", "UM", "Saldo", "Mínimo", "Máximo", "Comprar", "Situação", "Observação"];
export const MRP_EXPORT_COLW = [14, 46, 12, 20, 12, 7, 12, 11, 11, 12, 15, 52].map((wch) => ({ wch }));

export const MRP_EXPORT_TRANSIT_HDR = [
  "Código",
  "Descrição",
  "Área",
  "Quantidade",
  "Fornecedor",
  "Pedido de compra",
  "Requisição",
  "Data da requisição",
  "Previsão de entrega",
  "Data de recebimento",
  "Situação",
  "Compras do código"
];
export const MRP_EXPORT_TRANSIT_COLW = [14, 44, 12, 12, 30, 18, 16, 18, 18, 18, 22, 10].map((wch) => ({ wch }));

export const MRP_EXPORT_BASE_HDR = ["Código", "Descrição", "Área", "Conjunto", "Grupo", "UM", "Estoque mínimo", "Estoque máximo", "Status MRP"];
export const MRP_EXPORT_BASE_COLW = [14, 46, 12, 20, 14, 7, 15, 15, 28].map((wch) => ({ wch }));

export const MRP_EXPORT_FILE: Record<MrpExportType, string> = {
  buy: "Lista_Compra_MRP",
  "buy-by-area": "Lista_Compra_MRP",
  families: "Satelites_Coroas",
  idle: "Estoque_Parado",
  transit: "Compras_Realizadas",
  base: "Base_MRP"
};

/** Mensagens do HTML (toast) e a da FASE J para recorte sem linhas. */
export const MRP_EXPORT_MESSAGES = {
  noAnalysis: "Gere a análise primeiro.",
  nothing: "Nada para exportar.",
  noFamilies: "Nenhum conjunto identificado.",
  noPurchases: "Nenhuma compra carregada.",
  noBase: "Nenhuma Base MRP cadastrada."
} as const;

/** Um item da análise como a lista Comprar o lê (MrpBuyListItem tem estes campos). */
export type MrpExportLineItem = {
  code: string;
  description: string;
  area: string;
  family: string;
  group: string;
  unit: string;
  free: number;
  min: number;
  max: number;
  suggested: number;
  status: MrpAnalysisStatus;
  /** obsDe() */
  observation: string;
};
type LineItem = MrpExportLineItem;

/** `linha()` — Situação = status, com Comprado → "Em trânsito" (sem MRP continua "OK"). */
export function mrpExportLine(a: LineItem): MrpExportCell[] {
  return [a.code, a.description, a.area, a.family || "", a.group || "", a.unit || "", a.free, a.min, a.max, a.suggested, a.status === "Comprado" ? "Em trânsito" : a.status, a.observation];
}

/** `sheet(rows)` */
const sheet = (name: string, rows: readonly LineItem[]): MrpExportSheet => ({ name, rows: [MRP_EXPORT_HDR, ...rows.map(mrpExportLine)], cols: MRP_EXPORT_COLW });

/**
 * `dateStamp()` — AAAAMMDD do dia da geração. O HTML usava o relógio do
 * navegador (Brasil); no servidor (UTC na Vercel) o dia é calculado no fuso
 * America/Sao_Paulo para dar o mesmo dia que o usuário vê.
 */
export function mrpExportDateStamp(now: Date = new Date(), timeZone = "America/Sao_Paulo"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

export const mrpExportFileName = (type: MrpExportType, now?: Date) => `${MRP_EXPORT_FILE[type]}_${mrpExportDateStamp(now)}.xlsx`;

const fail = (message: string): MrpExportResult => ({ ok: false, message });
const done = (type: MrpExportType, sheets: MrpExportSheet[]): MrpExportResult => ({ ok: true, spec: { baseName: MRP_EXPORT_FILE[type], sheets } });

/** `exportCompra(false)` — recebe filtrarCompra() já filtrado/ordenado. */
export function buildMrpBuyExport(filtered: readonly LineItem[]): MrpExportResult {
  if (!filtered.length) return fail(MRP_EXPORT_MESSAGES.nothing);
  return done("buy", [sheet("Lista de compra", filtered)]);
}

/** `exportCompra(true)` — separa filtrarCompra() em Mecânica / Elétrica; sem aba vazia. */
export function buildMrpBuyByAreaExport(filtered: readonly LineItem[]): MrpExportResult {
  const sheets: MrpExportSheet[] = [];
  for (const ar of [MRP_AREA_MEC, MRP_AREA_ELE]) {
    const rows = filtered.filter((a) => a.area === ar);
    if (rows.length) sheets.push(sheet(ar.substring(0, 28), rows));
  }
  if (!sheets.length) return fail(MRP_EXPORT_MESSAGES.nothing);
  return done("buy-by-area", sheets);
}

/** `exportConjuntos()` — análise COMPLETA (ordem de materiais()), sem os filtros de Comprar. */
export function buildMrpFamiliesExport(analysis: readonly LineItem[]): MrpExportResult {
  const sheets: MrpExportSheet[] = [];
  for (const f of MRP_FAMILIES) {
    // Array.prototype.sort é estável: empates ficam na ordem da análise (position).
    const rows = analysis.filter((a) => a.family === f).sort((x, y) => y.suggested - x.suggested);
    if (rows.length) sheets.push(sheet(f.substring(0, 28), rows));
  }
  if (!sheets.length) return fail(MRP_EXPORT_MESSAGES.noFamilies);
  return done("families", sheets);
}

/** `exportParado()` — paradoRows() com as MESMAS 12 colunas da lista (sheet()). */
export function buildMrpIdleExport(idleRows: readonly LineItem[]): MrpExportResult {
  if (!idleRows.length) return fail(MRP_EXPORT_MESSAGES.nothing);
  return done("idle", [sheet("Sem movimentacao", idleRows)]);
}

const TRANSIT_SITUATION = { pend: "Em trânsito", rec: "Recebido", sem: "Sem pedido/requisição" } as const;

/** `exportTransito()` — TODOS os grupos de comprasIndex(), na ordem de 1ª aparição (sem sort). */
export function buildMrpTransitExport(groups: readonly MrpTransitGroup[]): MrpExportResult {
  if (!groups.length) return fail(MRP_EXPORT_MESSAGES.noPurchases);
  const rows: MrpExportCell[][] = groups.map((g) => [
    g.code,
    g.description,
    g.inBase ? g.area : "fora da base",
    g.quantity,
    g.supplier,
    g.purchaseOrderNumber,
    g.requisitionNumber,
    dataBR(g.requisitionDate),
    dataBR(g.expectedDeliveryDate),
    dataBR(g.receiptDate),
    TRANSIT_SITUATION[g.status],
    g.count
  ]);
  return done("transit", [{ name: "Compras", rows: [MRP_EXPORT_TRANSIT_HDR, ...rows], cols: MRP_EXPORT_TRANSIT_COLW }]);
}

/** `exportBase()` — baseFiltrada() da base exibida. */
export function buildMrpBaseExport(filtered: readonly MrpBaseViewRow[]): MrpExportResult {
  if (!filtered.length) return fail(MRP_EXPORT_MESSAGES.nothing);
  const rows: MrpExportCell[][] = filtered.map((m) => [m.code, m.description, m.area, m.family || "", m.group || "", m.unit || "", m.min, m.max, m.statusMrp || ""]);
  return done("base", [{ name: "Base MRP", rows: [MRP_EXPORT_BASE_HDR, ...rows], cols: MRP_EXPORT_BASE_COLW }]);
}

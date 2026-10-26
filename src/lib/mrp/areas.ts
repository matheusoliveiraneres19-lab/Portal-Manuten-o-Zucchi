/**
 * ANÁLISE MRP — aba ÁREAS & CONJUNTOS (FASE F), porta 1:1 de `renderAreas()`,
 * `cardHTML()` e `filtrarPor()` do `Analise_MRP_Compacto (1).html`.
 *
 * Opera sobre o resultado JÁ CALCULADO (itens do run, em ordem de position);
 * os números de cada cartão saem de countMrp — o mesmo contar() validado na
 * FASE D —, nunca de uma regra nova.
 */
import { countMrp, type MrpAnalysisStatus } from "./analysis-engine";
import { MRP_AREA_ELE, MRP_AREA_MEC, MRP_FAMILIES } from "./classification";

export type MrpAreaRow = { area: string; family: string; status: MrpAnalysisStatus; suggested: number; noParams: boolean };

/** Números de um cartão (`contar(rows)` + barra de composição). */
export type MrpSubsetSummary = {
  total: number;
  Comprar: number;
  Verificar: number;
  Comprado: number;
  OK: number;
  /** Soma de `suggested` de TODOS os itens do recorte (inclusive OK). */
  qtd: number;
  /** Materiais sem mín/máx no recorte (texto "X sem mín/máx" dos conjuntos). */
  noParams: number;
  /** Barra: % de Comprar / Verificar / Comprado / OK sobre max(1, total). */
  bar: { Comprar: number; Verificar: number; Comprado: number; OK: number };
};

/** Destino do clique (`filtrarPor(area, fam)`): abre Comprar com status "need". */
export type MrpAreaTarget = { area: string; family: string };

export type MrpAreasCard = { key: string; title: string; summary: MrpSubsetSummary; target: MrpAreaTarget };

export type MrpAreasSummary = {
  /** Mecânica, Elétrica e Total (sempre os três). */
  areas: MrpAreasCard[];
  /** Conjuntos presentes, na ordem de FAMS. */
  families: MrpAreasCard[];
  /** "Todos os conjuntos": números só dos itens com conjunto. */
  allFamilies: MrpAreasCard;
};

/** `contar(rows)` para um recorte + "sem mín/máx" + proporções da barra. */
export function summarizeMrpSubset(rows: readonly MrpAreaRow[]): MrpSubsetSummary {
  const c = countMrp(rows.map((r) => ({ status: r.status, suggested: r.suggested, noMovement: false, free: 0, purchase: null })));
  const t = Math.max(1, c.total);
  return {
    total: c.total,
    Comprar: c.Comprar,
    Verificar: c.Verificar,
    Comprado: c.Comprado,
    OK: c.OK,
    qtd: c.qtd,
    noParams: rows.filter((r) => r.noParams).length,
    bar: { Comprar: (c.Comprar / t) * 100, Verificar: (c.Verificar / t) * 100, Comprado: (c.Comprado / t) * 100, OK: (c.OK / t) * 100 }
  };
}

/** `renderAreas()` — cartões de área e de conjunto, com os destinos do clique. */
export function buildMrpAreasSummary(rows: readonly MrpAreaRow[]): MrpAreasSummary {
  const areas: MrpAreasCard[] = [
    { key: "mec", title: MRP_AREA_MEC, summary: summarizeMrpSubset(rows.filter((a) => a.area === MRP_AREA_MEC)), target: { area: MRP_AREA_MEC, family: "" } },
    { key: "ele", title: MRP_AREA_ELE, summary: summarizeMrpSubset(rows.filter((a) => a.area === MRP_AREA_ELE)), target: { area: MRP_AREA_ELE, family: "" } },
    { key: "total", title: "Total", summary: summarizeMrpSubset(rows), target: { area: "", family: "" } }
  ];
  const presentes = MRP_FAMILIES.filter((f) => rows.some((a) => a.family === f));
  const families: MrpAreasCard[] = presentes.map((f) => ({
    key: `fam:${f}`,
    title: f,
    summary: summarizeMrpSubset(rows.filter((a) => a.family === f)),
    // filtrarPor('', f): limpa a área.
    target: { area: "", family: f }
  }));
  const allFamilies: MrpAreasCard = {
    key: "fam:*",
    title: "Todos os conjuntos",
    // Números SÓ dos itens com conjunto (analysis.filter(a => a.familia))…
    summary: summarizeMrpSubset(rows.filter((a) => a.family)),
    // …mas o clique chama filtrarPor('', '') e abre a lista GERAL.
    // legacy parity behavior: mantido de propósito até a paridade final (FASE K).
    target: { area: "", family: "" }
  };
  return { areas, families, allFamilies };
}

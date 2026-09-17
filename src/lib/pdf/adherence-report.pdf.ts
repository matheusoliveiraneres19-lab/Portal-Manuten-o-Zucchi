/**
 * RELATÓRIO DE ADERÊNCIA — renderização do PDF.
 *
 * Documento PDF REAL (texto selecionável, vetores, paginação), nunca captura de
 * tela do dashboard. Gerado no servidor com `pdfkit`, que desenha em vetor e usa
 * as fontes padrão do PDF (Helvetica, codificação WinAnsi) — os acentos do
 * português saem certos sem embutir nenhuma fonte externa.
 *
 * ESTA CAMADA NÃO CALCULA REGRA DE NEGÓCIO. Todo número impresso vem pronto do
 * `service-order-adherence-report.service`; aqui só há formatação e layout. É o
 * que garante que o PDF não possa divergir da tela nem da API.
 *
 * Paginação (A4 paisagem):
 *   1  Capa
 *   2  Resumo executivo
 *   3+ Aderência (%) por mês e por área      — 12 meses por página
 *   n  Aderência (%) abertas x fechadas      — 12 meses por página
 *   n  Quantidade de OS por área
 *   n  Aderência por colaborador — Mecânica  — 14 colaboradores por página
 *   n  Aderência por colaborador — Elétrica  — idem
 *   n  Aderência aos serviços terceirizados
 *   n  Qualidade dos dados e metodologia
 */
import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ADHERENCE_AREA_ORDER,
  type AdherenceAreaCollaborators,
  type AdherenceAreaKey,
  type AdherenceMonthRow,
  type AdherenceReportDataset,
  type AdherenceTotals
} from "@/types/service-order-adherence-report";

/* ------------------------------------------------------------------ */
/* Identidade visual                                                  */
/* ------------------------------------------------------------------ */

/**
 * Paleta do portal (tailwind.config.ts). A paleta azul/laranja/verde do relatório
 * antigo foi deliberadamente descartada: ela não é da marca. Verde e vermelho
 * aparecem APENAS como semáforo de indicador, nunca como cor de série.
 */
const COLOR = {
  ink: "#0B0A08",
  graphite: "#141617",
  gold: "#D6AA3A",
  goldSoft: "#F6D98B",
  goldDeep: "#7B551F",
  parchment: "#D7CDBA",
  champagne: "#EFE3C2",
  marble: "#F5F0E8",
  white: "#FFFFFF",
  text: "#1C1A16",
  textDim: "#5C564C",
  rule: "#D8CFBE",
  success: "#2E8B57",
  warning: "#D6A935",
  danger: "#B01E35"
} as const;

/** Cor de cada série de área. Três tons distinguíveis também em impressão P&B. */
const AREA_COLOR: Record<AdherenceAreaKey, string> = {
  MECANICA: "#15506A",
  ELETRICA: "#D6AA3A",
  TERCEIROS: "#6E6257"
};

/** Semáforo do indicador de aderência. */
function adherenceColor(value: number | null): string {
  if (value === null) return COLOR.textDim;
  if (value >= 90) return COLOR.success;
  if (value >= 70) return COLOR.warning;
  return COLOR.danger;
}

/* ------------------------------------------------------------------ */
/* Geometria da página                                                */
/* ------------------------------------------------------------------ */

const PAGE = { width: 842, height: 595 } as const; // A4 paisagem, em pontos
const MARGIN = 40;
const CONTENT = { x: MARGIN, width: PAGE.width - MARGIN * 2 };
/** Faixa útil entre o cabeçalho e o rodapé das páginas internas. */
const BODY = { top: 92, bottom: PAGE.height - 52 };

/** Quantos meses cabem legíveis em um gráfico de colunas agrupadas. */
const MONTHS_PER_PAGE = 12;
/** Quantos colaboradores cabem em uma página de ranking. */
const COLLABORATORS_PER_PAGE = 14;

/* ------------------------------------------------------------------ */
/* Formatação                                                         */
/* ------------------------------------------------------------------ */

/** 1234 → "1.234". */
function fmtInt(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** 89.6 → "89,6%"; null → "—" (nunca "0%", nunca "NaN"). */
function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** ISO → "31/08/2026 14:07". */
function fmtDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo"
  });
}

/** Fatia um array em blocos de `size` — usado para não cortar gráfico nem tabela. */
function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ------------------------------------------------------------------ */
/* Logo                                                               */
/* ------------------------------------------------------------------ */

/**
 * Logo oficial do portal. Lido do disco uma vez por processo.
 *
 * Falha na leitura NÃO derruba o relatório: o cabeçalho cai para a marca
 * tipográfica. Um PDF sem imagem ainda entrega os indicadores; um erro 500 por
 * causa de um PNG não entrega nada.
 */
let logoCache: Buffer | null | undefined;

function getLogoBuffer(): Buffer | null {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = readFileSync(path.join(process.cwd(), "public", "images", "brand", "zucchi-logo-oficial.png"));
  } catch (error) {
    console.error("Logo Zucchi indisponível para o relatório de aderência; usando marca tipográfica.", error);
    logoCache = null;
  }
  return logoCache;
}

type Doc = PDFKit.PDFDocument;

/**
 * A logo é aberta UMA vez por documento e reutilizada em todas as páginas.
 *
 * `doc.image(buffer, …)` embute o PNG de novo a cada chamada: com a marca no
 * cabeçalho de todas as páginas, o relatório saía com 3,3 MB para ~10 páginas.
 * `doc.openImage` registra o XObject uma vez e as páginas apenas o referenciam.
 */
const openedLogos = new WeakMap<object, PDFKit.OpenedImage | null>();

function getLogo(doc: Doc): PDFKit.OpenedImage | null {
  const cached = openedLogos.get(doc);
  if (cached !== undefined) return cached;

  const buffer = getLogoBuffer();
  let opened: PDFKit.OpenedImage | null = null;
  if (buffer) {
    try {
      opened = doc.openImage(buffer);
    } catch (error) {
      console.error("Não foi possível decodificar a logo Zucchi; usando marca tipográfica.", error);
      opened = null;
    }
  }
  openedLogos.set(doc, opened);
  return opened;
}

/* ------------------------------------------------------------------ */
/* Primitivas de desenho                                              */
/* ------------------------------------------------------------------ */

type TextOptions = {
  size?: number;
  bold?: boolean;
  color?: string;
  width?: number;
  align?: "left" | "center" | "right";
};

/**
 * Glifos que a fonte padrão do PDF não imprime, e o que usar no lugar.
 *
 * Helvetica (fonte base do PDF) é codificada em WinAnsi. Auditado glifo a glifo
 * com `scripts/tmp-glyph-audit`: acentos do português, travessão, meia-risca,
 * aspas curvas, "·", "…", "»", "º/ª" e "×" saem corretos — mas "÷" sai como "+",
 * "→" como "!'" e "≥/≤" como aspas soltas.
 *
 * O "÷" era o pior deles: o subtítulo "a aderência é fechadas ÷ consideradas"
 * imprimia "fechadas + consideradas", ou seja, a fórmula ERRADA. Daí a troca por
 * "/", que qualquer leitor entende e a fonte garante.
 */
export const GLYPH_FALLBACK: Record<string, string> = {
  "÷": "/",
  // Sinal de menos tipográfico (U+2212), não o hífen: saía como aspas em
  // "Pendentes = Total − Fechadas".
  "−": "-",
  "≈": "~",
  "∞": "inf.",
  "→": "»",
  "←": "«",
  "↑": "^",
  "↓": "v",
  "≥": ">=",
  "≤": "<=",
  "≠": "!=",
  "⇒": "=>",
  "•": "·",
  "™": "(TM)"
};

const GLYPH_PATTERN = new RegExp(`[${Object.keys(GLYPH_FALLBACK).join("")}]`, "g");

/** Troca glifos que a fonte padrão não codifica. Aplicado a TODO texto impresso. */
function sanitize(value: string): string {
  return value.replace(GLYPH_PATTERN, (glyph) => GLYPH_FALLBACK[glyph] ?? glyph);
}

/** Aplica a fonte pedida e devolve a largura que o texto ocupa. */
function measure(doc: Doc, value: string, size: number, bold: boolean): number {
  return doc
    .font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(size)
    .widthOfString(value);
}

/**
 * Corta o texto com reticências até caber em `width`.
 *
 * `lineBreak: false` do pdfkit NÃO impede a quebra: nesta versão ele apenas
 * deixa de inferir a largura pelas margens, e qualquer `width` explícito ainda
 * aciona o quebrador de linha. Sem isto, um rótulo de coluna saía como "100,0"
 * com "%" na linha de baixo, e um nome longo empurrava a linha da tabela.
 */
function ellipsize(doc: Doc, value: string, width: number, size: number, bold: boolean): string {
  if (measure(doc, value, size, bold) <= width) return value;
  let cut = value;
  while (cut.length > 1 && measure(doc, `${cut}…`, size, bold) > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Texto de UMA linha em (x, y). Nunca quebra: o que não cabe é reticenciado. */
function text(doc: Doc, value: string, x: number, y: number, options: TextOptions = {}) {
  const { size = 9, bold = false, color = COLOR.text, width, align = "left" } = options;
  const safe = sanitize(value);
  const printable = width ? ellipsize(doc, safe, width, size, bold) : safe;
  doc
    .font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(size)
    .fillColor(color)
    .text(printable, x, y, width ? { width, align, lineBreak: false } : { lineBreak: false });
}

/**
 * Texto de gráfico que precisa caber inteiro: em vez de cortar, DIMINUI a fonte
 * até caber (piso de 4pt). Num rótulo de valor, "10…" seria pior que 5pt.
 */
function fitText(doc: Doc, value: string, x: number, y: number, width: number, options: TextOptions = {}) {
  const { size = 9, bold = false } = options;
  const safe = sanitize(value);
  let fitted = size;
  while (fitted > 4 && measure(doc, safe, fitted, bold) > width) fitted -= 0.25;
  text(doc, safe, x, y, { ...options, size: fitted, width });
}

/**
 * Parágrafo que QUEBRA em várias linhas (o oposto de `text`). Devolve a altura
 * ocupada, para o chamador empilhar o próximo bloco.
 */
function paragraph(
  doc: Doc,
  value: string,
  x: number,
  y: number,
  width: number,
  options: { size?: number; color?: string; lineGap?: number } = {}
): number {
  const { size = 9, color = COLOR.text, lineGap = 2 } = options;
  const safe = sanitize(value);
  doc.font("Helvetica").fontSize(size).fillColor(color);
  const height = doc.heightOfString(safe, { width, align: "justify", lineGap });
  doc.text(safe, x, y, { width, align: "justify", lineGap });
  return height;
}

/** Retângulo preenchido. */
function box(doc: Doc, x: number, y: number, w: number, h: number, color: string) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

/** Linha horizontal de 0,7pt. */
function rule(doc: Doc, x: number, y: number, w: number, color: string = COLOR.rule) {
  doc.save().lineWidth(0.7).strokeColor(color).moveTo(x, y).lineTo(x + w, y).stroke().restore();
}

/**
 * Cabeçalho e rodapé das páginas internas. O número da página é estampado no
 * fim (ver `stampPageNumbers`), quando o total já é conhecido.
 */
function pageChrome(doc: Doc, dataset: AdherenceReportDataset, title: string, subtitle?: string) {
  box(doc, 0, 0, PAGE.width, 64, COLOR.ink);
  box(doc, 0, 64, PAGE.width, 2.5, COLOR.gold);

  const logo = getLogo(doc);
  if (logo) {
    doc.image(logo, MARGIN, 12, { height: 40 });
  } else {
    text(doc, "ZUCCHI", MARGIN, 22, { size: 16, bold: true, color: COLOR.gold });
  }

  const textLeft = MARGIN + (logo ? 52 : 70);
  text(doc, title.toUpperCase(), textLeft, subtitle ? 18 : 25, {
    size: 12.5,
    bold: true,
    color: COLOR.white,
    width: CONTENT.width - 260,
    align: "left"
  });
  if (subtitle) {
    text(doc, subtitle, textLeft, 36, { size: 8.5, color: COLOR.parchment, width: CONTENT.width - 260 });
  }

  text(doc, "PERÍODO ANALISADO", CONTENT.x, 20, { size: 7, color: COLOR.goldSoft, width: CONTENT.width, align: "right" });
  text(doc, dataset.periodo.label, CONTENT.x, 32, {
    size: 10,
    bold: true,
    color: COLOR.white,
    width: CONTENT.width,
    align: "right"
  });

  rule(doc, CONTENT.x, PAGE.height - 38, CONTENT.width);
  text(doc, "PCM · Planejamento e Controle da Manutenção — Portal de Gestão da Manutenção Zucchi", CONTENT.x, PAGE.height - 30, {
    size: 7.5,
    color: COLOR.textDim
  });
}

/** Nova página interna já com cabeçalho/rodapé. */
function newPage(doc: Doc, dataset: AdherenceReportDataset, title: string, subtitle?: string) {
  doc.addPage();
  box(doc, 0, 0, PAGE.width, PAGE.height, COLOR.white);
  pageChrome(doc, dataset, title, subtitle);
}

/* ------------------------------------------------------------------ */
/* Componentes                                                        */
/* ------------------------------------------------------------------ */

/** Cartão de indicador: rótulo, valor grande e nota de apoio. */
function kpiCard(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  hint: string,
  accent: string
) {
  box(doc, x, y, w, h, COLOR.marble);
  box(doc, x, y, 3.5, h, accent);
  text(doc, label.toUpperCase(), x + 14, y + 12, { size: 7.5, bold: true, color: COLOR.textDim, width: w - 24 });
  text(doc, value, x + 14, y + 26, { size: 22, bold: true, color: accent, width: w - 24 });
  text(doc, hint, x + 14, y + h - 20, { size: 7.5, color: COLOR.textDim, width: w - 24 });
}

/** Legenda horizontal de séries. */
function legend(doc: Doc, x: number, y: number, entries: { label: string; color: string }[]) {
  let cursor = x;
  for (const entry of entries) {
    box(doc, cursor, y + 1, 9, 9, entry.color);
    text(doc, entry.label, cursor + 13, y + 2, { size: 8, color: COLOR.text });
    cursor += 13 + doc.font("Helvetica").fontSize(8).widthOfString(entry.label) + 20;
  }
}

type Column = {
  header: string;
  width: number;
  align?: "left" | "center" | "right";
  /** Valor da célula já formatado. */
  value: (row: Record<string, string>) => string;
  /** Cor do texto da célula (semáforo). */
  color?: (row: Record<string, string>) => string;
};

/** Tabela com cabeçalho escuro e zebra clara. Devolve o Y após a última linha. */
function table(doc: Doc, x: number, y: number, columns: Column[], rows: Record<string, string>[], rowHeight = 18): number {
  const width = columns.reduce((sum, column) => sum + column.width, 0);

  box(doc, x, y, width, 20, COLOR.ink);
  let cx = x;
  for (const column of columns) {
    text(doc, column.header, cx + 6, y + 6.5, {
      size: 7.5,
      bold: true,
      color: COLOR.goldSoft,
      width: column.width - 12,
      align: column.align ?? "left"
    });
    cx += column.width;
  }

  let cy = y + 20;
  rows.forEach((row, index) => {
    if (index % 2 === 1) box(doc, x, cy, width, rowHeight, COLOR.marble);
    cx = x;
    for (const column of columns) {
      text(doc, column.value(row), cx + 6, cy + rowHeight / 2 - 4, {
        size: 8,
        color: column.color?.(row) ?? COLOR.text,
        width: column.width - 12,
        align: column.align ?? "left"
      });
      cx += column.width;
    }
    cy += rowHeight;
  });

  rule(doc, x, cy, width);
  return cy;
}

/* ------------------------------------------------------------------ */
/* Gráficos vetoriais                                                 */
/* ------------------------------------------------------------------ */

type GroupedSeries = {
  label: string;
  color: string;
  /** `null` = sem OS no grupo → coluna ausente e rótulo "—". */
  values: (number | null)[];
};

/**
 * Colunas agrupadas com eixo 0–100% e o percentual escrito sobre cada coluna.
 *
 * Um grupo sem dados (`null`) não desenha coluna alguma e recebe "—" no lugar do
 * rótulo: 0% diria "havia ordens e nenhuma foi encerrada", que é o oposto de
 * "não havia ordens".
 */
function groupedPercentChart(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  categories: string[],
  series: GroupedSeries[]
) {
  const axisWidth = 30;
  const labelHeight = 16;
  const plot = { x: x + axisWidth, y, width: w - axisWidth, height: h - labelHeight };

  // Grade horizontal a cada 25%.
  for (let tick = 0; tick <= 100; tick += 25) {
    const ty = plot.y + plot.height - (tick / 100) * plot.height;
    rule(doc, plot.x, ty, plot.width, tick === 0 ? COLOR.textDim : COLOR.rule);
    text(doc, `${tick}%`, x, ty - 4, { size: 7, color: COLOR.textDim, width: axisWidth - 6, align: "right" });
  }

  if (categories.length === 0) return;

  const slot = plot.width / categories.length;
  const groupWidth = slot * 0.72;
  const barWidth = groupWidth / series.length;
  const valueFontSize = categories.length > 8 ? 5.5 : 6.5;

  categories.forEach((category, index) => {
    const groupX = plot.x + slot * index + (slot - groupWidth) / 2;

    series.forEach((serie, serieIndex) => {
      const value = serie.values[index];
      const bx = groupX + barWidth * serieIndex;

      if (value === null || value === undefined) {
        fitText(doc, "—", bx, plot.y + plot.height - 12, barWidth, {
          size: valueFontSize,
          color: COLOR.textDim,
          align: "center"
        });
        return;
      }

      // Altura mínima de 1pt para que 0% continue sendo uma coluna visível.
      const barHeight = Math.max(1, (value / 100) * plot.height);
      box(doc, bx + 1, plot.y + plot.height - barHeight, barWidth - 2, barHeight, serie.color);
      fitText(doc, fmtPct(value), bx, plot.y + plot.height - barHeight - 9, barWidth, {
        size: valueFontSize,
        bold: true,
        color: COLOR.text,
        align: "center"
      });
    });

    fitText(doc, category, plot.x + slot * index, plot.y + plot.height + 5, slot, {
      size: categories.length > 8 ? 6.5 : 7.5,
      color: COLOR.text,
      align: "center"
    });
  });
}

/**
 * Colunas de QUANTIDADE (consideradas x fechadas) com o percentual de aderência
 * impresso acima de cada par. Escala automática pelo maior valor.
 */
function countsChart(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  categories: string[],
  totals: number[],
  closed: number[],
  adherence: (number | null)[]
) {
  const axisWidth = 34;
  const labelHeight = 16;
  // Espaço acima da área de plotagem para DUAS linhas de rótulo sem colisão: o
  // valor da coluna mais alta (que encosta no topo) e a aderência acima dele.
  const headroom = 28;
  const plot = { x: x + axisWidth, y: y + headroom, width: w - axisWidth, height: h - labelHeight - headroom };
  const max = Math.max(1, ...totals);

  for (let step = 0; step <= 4; step += 1) {
    const value = (max / 4) * step;
    const ty = plot.y + plot.height - (step / 4) * plot.height;
    rule(doc, plot.x, ty, plot.width, step === 0 ? COLOR.textDim : COLOR.rule);
    text(doc, fmtInt(Math.round(value)), x, ty - 4, { size: 7, color: COLOR.textDim, width: axisWidth - 6, align: "right" });
  }

  if (categories.length === 0) return;

  const slot = plot.width / categories.length;
  const groupWidth = slot * 0.66;
  const barWidth = groupWidth / 2;
  const fontSize = categories.length > 8 ? 5.5 : 6.5;

  categories.forEach((category, index) => {
    const groupX = plot.x + slot * index + (slot - groupWidth) / 2;
    const pairs: { value: number; color: string }[] = [
      { value: totals[index] ?? 0, color: COLOR.goldDeep },
      { value: closed[index] ?? 0, color: COLOR.gold }
    ];

    pairs.forEach((pair, pairIndex) => {
      const barHeight = Math.max(pair.value > 0 ? 1 : 0, (pair.value / max) * plot.height);
      const bx = groupX + barWidth * pairIndex;
      if (barHeight > 0) box(doc, bx + 1, plot.y + plot.height - barHeight, barWidth - 2, barHeight, pair.color);
      fitText(doc, fmtInt(pair.value), bx, plot.y + plot.height - barHeight - 8, barWidth, {
        size: fontSize,
        color: COLOR.text,
        align: "center"
      });
    });

    // Aderência do mês, acima do par.
    fitText(doc, fmtPct(adherence[index] ?? null), plot.x + slot * index, plot.y - 13, slot, {
      size: fontSize + 0.5,
      bold: true,
      color: adherenceColor(adherence[index] ?? null),
      align: "center"
    });

    fitText(doc, category, plot.x + slot * index, plot.y + plot.height + 5, slot, {
      size: categories.length > 8 ? 6.5 : 7.5,
      color: COLOR.text,
      align: "center"
    });
  });
}

/** Barras horizontais de aderência (rankings por colaborador). */
function horizontalAdherenceBars(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  rows: { label: string; value: number | null; hint: string }[],
  rowHeight: number
) {
  const labelWidth = 168;
  const hintWidth = 96;
  const trackX = x + labelWidth;
  const trackWidth = w - labelWidth - hintWidth - 44;

  rows.forEach((row, index) => {
    const cy = y + index * rowHeight;
    const color = adherenceColor(row.value);

    text(doc, row.label, x, cy + rowHeight / 2 - 4, { size: 8, color: COLOR.text, width: labelWidth - 8 });
    box(doc, trackX, cy + rowHeight / 2 - 6, trackWidth, 12, COLOR.marble);

    if (row.value !== null) {
      const barWidth = Math.max(1, (row.value / 100) * trackWidth);
      box(doc, trackX, cy + rowHeight / 2 - 6, barWidth, 12, color);
    }

    text(doc, fmtPct(row.value), trackX + trackWidth + 6, cy + rowHeight / 2 - 4, {
      size: 8,
      bold: true,
      color,
      width: 38,
      align: "right"
    });
    text(doc, row.hint, trackX + trackWidth + 50, cy + rowHeight / 2 - 4, {
      size: 7.5,
      color: COLOR.textDim,
      width: hintWidth
    });
  });
}

/* ------------------------------------------------------------------ */
/* Páginas                                                            */
/* ------------------------------------------------------------------ */

/** PÁGINA 1 — capa. */
function renderCover(doc: Doc, dataset: AdherenceReportDataset) {
  box(doc, 0, 0, PAGE.width, PAGE.height, COLOR.ink);
  box(doc, 0, 0, PAGE.width, 6, COLOR.gold);
  box(doc, 0, PAGE.height - 6, PAGE.width, 6, COLOR.gold);

  const logo = getLogo(doc);
  if (logo) {
    doc.image(logo, MARGIN + 8, 62, { height: 116 });
  } else {
    text(doc, "ZUCCHI", MARGIN + 8, 86, { size: 44, bold: true, color: COLOR.gold });
    text(doc, "LUXURY STONES", MARGIN + 10, 138, { size: 12, color: COLOR.parchment });
  }

  const left = MARGIN + 8;
  box(doc, left, 214, 66, 3, COLOR.gold);

  text(doc, "RELATÓRIO DE ADERÊNCIA", left, 234, { size: 34, bold: true, color: COLOR.white });
  text(doc, "À EXECUÇÃO DAS ORDENS DE SERVIÇOS", left, 274, { size: 20, bold: true, color: COLOR.gold });

  text(doc, "PERÍODO", left, 336, { size: 8.5, bold: true, color: COLOR.goldSoft });
  text(doc, dataset.periodo.titleLabel, left, 350, { size: 17, bold: true, color: COLOR.white });
  text(doc, dataset.periodo.label, left, 374, { size: 10.5, color: COLOR.parchment });

  // Indicador de capa: o número que o relatório inteiro existe para responder.
  const cardX = PAGE.width - MARGIN - 250;
  box(doc, cardX, 214, 250, 172, COLOR.graphite);
  box(doc, cardX, 214, 250, 3, COLOR.gold);
  text(doc, "ADERÊNCIA GERAL", cardX + 22, 240, { size: 8.5, bold: true, color: COLOR.goldSoft });
  text(doc, fmtPct(dataset.geral.aderencia), cardX + 22, 258, { size: 52, bold: true, color: COLOR.gold });
  text(
    doc,
    `${fmtInt(dataset.geral.fechadas)} de ${fmtInt(dataset.geral.total)} ordens tecnicamente encerradas`,
    cardX + 22,
    330,
    { size: 8.5, color: COLOR.parchment, width: 210 }
  );
  text(doc, "Mecânica · Elétrica · Terceiros", cardX + 22, 352, { size: 8.5, color: COLOR.parchment, width: 210 });

  rule(doc, left, 452, PAGE.width - MARGIN * 2 - 8, COLOR.goldDeep);
  text(doc, "PCM · PLANEJAMENTO E CONTROLE DA MANUTENÇÃO", left, 466, { size: 10, bold: true, color: COLOR.gold });
  text(doc, "Portal de Gestão da Manutenção Zucchi", left, 482, { size: 9, color: COLOR.parchment });
  text(doc, `Emitido em ${fmtDateTime(dataset.geradoEm)}`, left, 496, { size: 8, color: COLOR.textDim });

  const filterNote = dataset.filtros.usouFiltrosDaTela
    ? dataset.filtros.descricao.length
      ? `Filtros da tela aplicados — ${dataset.filtros.descricao.join(" · ")}`
      : "Filtros da tela aplicados — nenhum filtro adicional ativo além do período."
    : "Sem filtros da tela: o recorte é apenas o período acima.";
  text(doc, filterNote, left, 516, { size: 7.5, color: COLOR.textDim, width: PAGE.width - MARGIN * 2 - 16 });
}

/** PÁGINA 2 — resumo executivo, com texto gerado a partir dos números. */
function renderExecutiveSummary(doc: Doc, dataset: AdherenceReportDataset) {
  newPage(doc, dataset, "Resumo executivo", "Visão consolidada do período e desempenho por área");

  const cardWidth = (CONTENT.width - 3 * 12) / 4;
  const cards: { label: string; value: string; hint: string; accent: string }[] = [
    {
      label: "Total de OS",
      value: fmtInt(dataset.geral.total),
      hint: "ordens consideradas no período",
      accent: COLOR.goldDeep
    },
    {
      label: "OS encerradas",
      value: fmtInt(dataset.geral.fechadas),
      hint: "status Tecnicamente encerrado",
      accent: COLOR.success
    },
    {
      label: "OS em aberto",
      value: fmtInt(dataset.geral.abertas),
      hint: "demais status do recorte",
      accent: COLOR.danger
    },
    {
      label: "Aderência geral",
      value: fmtPct(dataset.geral.aderencia),
      hint: "encerradas ÷ total consideradas",
      accent: adherenceColor(dataset.geral.aderencia)
    }
  ];

  cards.forEach((card, index) => {
    kpiCard(doc, CONTENT.x + index * (cardWidth + 12), BODY.top, cardWidth, 80, card.label, card.value, card.hint, card.accent);
  });

  // Texto automático — descreve os números, sem conclusão inventada.
  const paragraphY = BODY.top + 96;
  const melhor = [...dataset.porArea].filter((a) => a.aderencia !== null).sort((a, b) => (b.aderencia ?? 0) - (a.aderencia ?? 0));
  const frases: string[] = [];

  if (dataset.geral.total === 0) {
    frases.push(
      `No período de ${dataset.periodo.label} não foi encontrada nenhuma ordem de serviço nas áreas Mecânica, Elétrica ou Terceiros com os filtros aplicados.`
    );
  } else {
    frases.push(
      `No período analisado (${dataset.periodo.label}) foram consideradas ${fmtInt(dataset.geral.total)} ordens de serviço das áreas Mecânica, Elétrica e Terceiros.`
    );
    frases.push(
      `Dessas, ${fmtInt(dataset.geral.fechadas)} encontram-se tecnicamente encerradas e ${fmtInt(dataset.geral.abertas)} permanecem em aberto, resultando em uma aderência geral de ${fmtPct(dataset.geral.aderencia)}.`
    );
    if (melhor.length >= 2) {
      const primeira = melhor[0];
      const ultima = melhor[melhor.length - 1];
      frases.push(
        `A maior aderência do período é da área ${primeira.label} (${fmtPct(primeira.aderencia)}, ${fmtInt(primeira.fechadas)} de ${fmtInt(primeira.total)}) e a menor é da área ${ultima.label} (${fmtPct(ultima.aderencia)}, ${fmtInt(ultima.fechadas)} de ${fmtInt(ultima.total)}).`
      );
    }
    if (dataset.qualidade.semResponsavel > 0) {
      frases.push(
        `${fmtInt(dataset.qualidade.semResponsavel)} das ordens consideradas estão sem responsável preenchido e, por isso, não entram nos rankings individuais — são reportadas à parte em cada área.`
      );
    }
  }

  paragraph(doc, frases.join(" "), CONTENT.x, paragraphY, CONTENT.width, { size: 10, lineGap: 2.5 });

  // Tabela por área.
  const tableY = paragraphY + 76;
  text(doc, "DESEMPENHO POR ÁREA", CONTENT.x, tableY - 16, { size: 9, bold: true, color: COLOR.goldDeep });

  const columns: Column[] = [
    { header: "Área", width: 200, value: (r) => r.area },
    { header: "Total de OS", width: 120, align: "right", value: (r) => r.total },
    { header: "Encerradas", width: 120, align: "right", value: (r) => r.fechadas },
    { header: "Em aberto", width: 120, align: "right", value: (r) => r.abertas },
    {
      header: "Aderência",
      width: 120,
      align: "right",
      value: (r) => r.aderencia,
      color: (r) => adherenceColor(r.aderenciaRaw === "" ? null : Number(r.aderenciaRaw))
    }
  ];

  const rows = dataset.porArea.map((area) => ({
    area: area.label,
    total: fmtInt(area.total),
    fechadas: fmtInt(area.fechadas),
    abertas: fmtInt(area.abertas),
    aderencia: fmtPct(area.aderencia),
    aderenciaRaw: area.aderencia === null ? "" : String(area.aderencia)
  }));

  const endY = table(doc, CONTENT.x, tableY, columns, rows, 20);

  // Linha de total — a soma das áreas TEM de bater com o geral.
  box(doc, CONTENT.x, endY, 680, 22, COLOR.champagne);
  text(doc, "TOTAL", CONTENT.x + 6, endY + 7, { size: 8.5, bold: true, color: COLOR.ink, width: 194 });
  text(doc, fmtInt(dataset.geral.total), CONTENT.x + 200, endY + 7, { size: 8.5, bold: true, width: 114, align: "right" });
  text(doc, fmtInt(dataset.geral.fechadas), CONTENT.x + 320, endY + 7, { size: 8.5, bold: true, width: 114, align: "right" });
  text(doc, fmtInt(dataset.geral.abertas), CONTENT.x + 440, endY + 7, { size: 8.5, bold: true, width: 114, align: "right" });
  text(doc, fmtPct(dataset.geral.aderencia), CONTENT.x + 560, endY + 7, {
    size: 8.5,
    bold: true,
    color: adherenceColor(dataset.geral.aderencia),
    width: 114,
    align: "right"
  });

  // Evolução mensal da aderência geral — o mesmo recorte, em uma linha só. Usa a
  // série já calculada; nada é recontado aqui.
  const trendY = endY + 52;
  text(doc, "EVOLUÇÃO DA ADERÊNCIA GERAL NO PERÍODO", CONTENT.x, trendY - 16, {
    size: 9,
    bold: true,
    color: COLOR.goldDeep
  });

  groupedPercentChart(doc, CONTENT.x, trendY, CONTENT.width, BODY.bottom - trendY - 14, dataset.porMes.map((month) => month.label), [
    { label: "Geral", color: COLOR.goldDeep, values: dataset.porMes.map((month) => month.geral.aderencia) }
  ]);
}

/** PÁGINA 3 — aderência (%) por mês e por área. Uma página a cada 12 meses. */
function renderMonthlyByArea(doc: Doc, dataset: AdherenceReportDataset) {
  const pages = chunk(dataset.porMes, MONTHS_PER_PAGE);

  pages.forEach((months, pageIndex) => {
    const suffix = pages.length > 1 ? ` (${pageIndex + 1}/${pages.length})` : "";
    newPage(doc, dataset, `Aderência (%) à execução das ordens de serviços${suffix}`, "Por mês e por área");

    legend(
      doc,
      CONTENT.x,
      BODY.top - 4,
      ADHERENCE_AREA_ORDER.map((area) => ({
        label: area === "MECANICA" ? "Mecânica" : area === "ELETRICA" ? "Elétrica" : "Terceiros",
        color: AREA_COLOR[area]
      }))
    );

    const chartY = BODY.top + 16;
    const chartHeight = 296;
    groupedPercentChart(
      doc,
      CONTENT.x,
      chartY,
      CONTENT.width,
      chartHeight,
      months.map((month) => month.label),
      ADHERENCE_AREA_ORDER.map((area) => ({
        label: area,
        color: AREA_COLOR[area],
        values: months.map((month) => month.porArea[area].aderencia)
      }))
    );

    // Tabela de apoio: o gráfico mostra o percentual, a tabela mostra o denominador.
    const tableY = chartY + chartHeight + 26;
    text(doc, "FECHADAS / TOTAL CONSIDERADO POR MÊS", CONTENT.x, tableY - 14, {
      size: 8.5,
      bold: true,
      color: COLOR.goldDeep
    });

    const labelWidth = 118;
    const cellWidth = (CONTENT.width - labelWidth) / Math.max(1, months.length);

    box(doc, CONTENT.x, tableY, CONTENT.width, 17, COLOR.ink);
    text(doc, "ÁREA", CONTENT.x + 6, tableY + 5, { size: 7, bold: true, color: COLOR.goldSoft, width: labelWidth - 12 });
    months.forEach((month, index) => {
      text(doc, month.shortLabel, CONTENT.x + labelWidth + index * cellWidth, tableY + 5, {
        size: 7,
        bold: true,
        color: COLOR.goldSoft,
        width: cellWidth,
        align: "center"
      });
    });

    const areaRows = [
      ...ADHERENCE_AREA_ORDER.map((area) => ({
        label: area === "MECANICA" ? "Mecânica" : area === "ELETRICA" ? "Elétrica" : "Terceiros",
        cells: months.map((month) => month.porArea[area]),
        bold: false
      })),
      { label: "Total do mês", cells: months.map((month) => month.geral), bold: true }
    ];

    areaRows.forEach((row, index) => {
      const ry = tableY + 17 + index * 17;
      if (index % 2 === 1) box(doc, CONTENT.x, ry, CONTENT.width, 17, COLOR.marble);
      if (row.bold) box(doc, CONTENT.x, ry, CONTENT.width, 17, COLOR.champagne);
      text(doc, row.label, CONTENT.x + 6, ry + 5, {
        size: 7.5,
        bold: row.bold,
        color: COLOR.text,
        width: labelWidth - 12
      });
      row.cells.forEach((cell, cellIndex) => {
        text(doc, cell.total === 0 ? "—" : `${fmtInt(cell.fechadas)}/${fmtInt(cell.total)}`, CONTENT.x + labelWidth + cellIndex * cellWidth, ry + 5, {
          size: 7,
          bold: row.bold,
          color: cell.total === 0 ? COLOR.textDim : COLOR.text,
          width: cellWidth,
          align: "center"
        });
      });
    });

    text(doc, "“—” indica mês sem nenhuma ordem de serviço na área — não é 0% de aderência.", CONTENT.x, tableY + 17 + areaRows.length * 17 + 8, {
      size: 7,
      color: COLOR.textDim,
      width: CONTENT.width
    });
  });
}

/** PÁGINA 4 — consideradas x fechadas por mês. */
function renderOpenVsClosed(doc: Doc, dataset: AdherenceReportDataset) {
  const pages = chunk(dataset.porMes, MONTHS_PER_PAGE);

  pages.forEach((months, pageIndex) => {
    const suffix = pages.length > 1 ? ` (${pageIndex + 1}/${pages.length})` : "";
    newPage(
      doc,
      dataset,
      `Aderência (%) às ordens de serviços${suffix}`,
      "OS consideradas x OS fechadas, por mês — a aderência é fechadas ÷ consideradas"
    );

    legend(doc, CONTENT.x, BODY.top - 4, [
      { label: "OS consideradas (total do mês)", color: COLOR.goldDeep },
      { label: "OS fechadas (tecnicamente encerradas)", color: COLOR.gold }
    ]);

    const chartY = BODY.top + 16;
    const chartHeight = 292;
    countsChart(
      doc,
      CONTENT.x,
      chartY,
      CONTENT.width,
      chartHeight,
      months.map((month) => month.label),
      months.map((month) => month.geral.total),
      months.map((month) => month.geral.fechadas),
      months.map((month) => month.geral.aderencia)
    );

    const tableY = chartY + chartHeight + 28;
    const labelWidth = 118;
    const cellWidth = (CONTENT.width - labelWidth) / Math.max(1, months.length);

    box(doc, CONTENT.x, tableY, CONTENT.width, 17, COLOR.ink);
    text(doc, "MÊS", CONTENT.x + 6, tableY + 5, { size: 7, bold: true, color: COLOR.goldSoft, width: labelWidth - 12 });
    months.forEach((month, index) => {
      text(doc, month.shortLabel, CONTENT.x + labelWidth + index * cellWidth, tableY + 5, {
        size: 7,
        bold: true,
        color: COLOR.goldSoft,
        width: cellWidth,
        align: "center"
      });
    });

    const rows: { label: string; render: (month: AdherenceMonthRow) => string; color?: (m: AdherenceMonthRow) => string }[] = [
      { label: "OS consideradas", render: (month) => fmtInt(month.geral.total) },
      { label: "OS fechadas", render: (month) => fmtInt(month.geral.fechadas) },
      { label: "OS em aberto", render: (month) => fmtInt(month.geral.abertas) },
      {
        label: "Aderência",
        render: (month) => fmtPct(month.geral.aderencia),
        color: (month) => adherenceColor(month.geral.aderencia)
      }
    ];

    rows.forEach((row, index) => {
      const ry = tableY + 17 + index * 17;
      if (index % 2 === 1) box(doc, CONTENT.x, ry, CONTENT.width, 17, COLOR.marble);
      text(doc, row.label, CONTENT.x + 6, ry + 5, { size: 7.5, color: COLOR.text, width: labelWidth - 12 });
      months.forEach((month, cellIndex) => {
        text(doc, row.render(month), CONTENT.x + labelWidth + cellIndex * cellWidth, ry + 5, {
          size: 7,
          bold: row.color !== undefined,
          color: row.color?.(month) ?? COLOR.text,
          width: cellWidth,
          align: "center"
        });
      });
    });

    text(
      doc,
      "Nomenclatura explícita: a série ESCURA é o TOTAL CONSIDERADO no mês e a CLARA são as FECHADAS. O relatório anterior rotulava a série maior como “O.S ABERTAS”, o que não correspondia ao denominador da fórmula.",
      CONTENT.x,
      tableY + 17 + rows.length * 17 + 8,
      { size: 7, color: COLOR.textDim, width: CONTENT.width }
    );
  });
}

/** PÁGINA 5 — quantidade de OS por área. */
function renderCountsByArea(doc: Doc, dataset: AdherenceReportDataset) {
  newPage(doc, dataset, "Quantidade de ordens de serviço por área", "Total, fechadas, pendentes e aderência");

  const chartY = BODY.top + 8;
  const chartHeight = 268;

  legend(doc, CONTENT.x, BODY.top - 8, [
    { label: "Total de OS", color: COLOR.goldDeep },
    { label: "OS fechadas", color: COLOR.gold }
  ]);

  countsChart(
    doc,
    CONTENT.x,
    chartY,
    CONTENT.width,
    chartHeight,
    dataset.porArea.map((area) => area.label),
    dataset.porArea.map((area) => area.total),
    dataset.porArea.map((area) => area.fechadas),
    dataset.porArea.map((area) => area.aderencia)
  );

  const tableY = chartY + chartHeight + 34;
  const columns: Column[] = [
    { header: "Área", width: 220, value: (r) => r.area },
    { header: "Total", width: 130, align: "right", value: (r) => r.total },
    { header: "Fechadas", width: 130, align: "right", value: (r) => r.fechadas },
    { header: "Pendentes", width: 130, align: "right", value: (r) => r.pendentes },
    {
      header: "Aderência",
      width: 130,
      align: "right",
      value: (r) => r.aderencia,
      color: (r) => adherenceColor(r.raw === "" ? null : Number(r.raw))
    }
  ];

  const rows = dataset.porArea.map((area) => ({
    area: area.label,
    total: fmtInt(area.total),
    fechadas: fmtInt(area.fechadas),
    pendentes: fmtInt(area.abertas),
    aderencia: fmtPct(area.aderencia),
    raw: area.aderencia === null ? "" : String(area.aderencia)
  }));

  const endY = table(doc, CONTENT.x, tableY, columns, rows, 22);

  box(doc, CONTENT.x, endY, 740, 24, COLOR.champagne);
  text(doc, "TOTAL", CONTENT.x + 6, endY + 8, { size: 9, bold: true, color: COLOR.ink, width: 214 });
  text(doc, fmtInt(dataset.geral.total), CONTENT.x + 220, endY + 8, { size: 9, bold: true, width: 124, align: "right" });
  text(doc, fmtInt(dataset.geral.fechadas), CONTENT.x + 350, endY + 8, { size: 9, bold: true, width: 124, align: "right" });
  text(doc, fmtInt(dataset.geral.abertas), CONTENT.x + 480, endY + 8, { size: 9, bold: true, width: 124, align: "right" });
  text(doc, fmtPct(dataset.geral.aderencia), CONTENT.x + 610, endY + 8, {
    size: 9,
    bold: true,
    color: adherenceColor(dataset.geral.aderencia),
    width: 124,
    align: "right"
  });

  text(doc, "Pendentes = Total − Fechadas. A soma das três áreas é exatamente o total geral do relatório.", CONTENT.x, endY + 34, {
    size: 7.5,
    color: COLOR.textDim,
    width: CONTENT.width
  });
}

/** PÁGINAS 6/7/8 — ranking por colaborador de uma área. */
function renderCollaborators(doc: Doc, dataset: AdherenceReportDataset, group: AdherenceAreaCollaborators, title: string) {
  const pages = chunk(group.rows, COLLABORATORS_PER_PAGE);

  pages.forEach((rows, pageIndex) => {
    const suffix = pages.length > 1 ? ` (${pageIndex + 1}/${pages.length})` : "";
    newPage(doc, dataset, `${title}${suffix}`, "Ordenado da maior para a menor aderência; empate resolvido pelo maior volume de OS");

    // Resumo da área, para o ranking poder ser conferido contra o total.
    const cardWidth = (CONTENT.width - 3 * 12) / 4;
    const cards = [
      { label: `Total ${group.label}`, value: fmtInt(group.totals.total), hint: "OS no período", accent: COLOR.goldDeep },
      { label: "Fechadas", value: fmtInt(group.totals.fechadas), hint: "tecnicamente encerradas", accent: COLOR.success },
      { label: "Pendentes", value: fmtInt(group.totals.abertas), hint: "em aberto", accent: COLOR.danger },
      {
        label: "Aderência da área",
        value: fmtPct(group.totals.aderencia),
        hint: "fechadas ÷ total",
        accent: adherenceColor(group.totals.aderencia)
      }
    ];
    cards.forEach((card, index) => {
      kpiCard(doc, CONTENT.x + index * (cardWidth + 12), BODY.top - 6, cardWidth, 70, card.label, card.value, card.hint, card.accent);
    });

    const listY = BODY.top + 84;

    if (rows.length === 0) {
      text(doc, "Nenhuma ordem com responsável preenchido nesta área no período selecionado.", CONTENT.x, listY + 10, {
        size: 9.5,
        color: COLOR.textDim,
        width: CONTENT.width
      });
    } else {
      text(doc, "COLABORADOR", CONTENT.x, listY - 14, { size: 7.5, bold: true, color: COLOR.goldDeep });
      text(doc, "ADERÊNCIA · FECHADAS / ATRIBUÍDAS", CONTENT.x + 200, listY - 14, { size: 7.5, bold: true, color: COLOR.goldDeep });

      horizontalAdherenceBars(
        doc,
        CONTENT.x,
        listY,
        CONTENT.width,
        rows.map((row) => ({
          label: row.responsavel,
          value: row.aderencia,
          hint: `${fmtInt(row.fechadas)} de ${fmtInt(row.total)} · ${fmtInt(row.pendentes)} pendente(s)`
        })),
        Math.min(26, (BODY.bottom - listY - 40) / Math.max(1, rows.length))
      );
    }

    // "SEM RESPONSÁVEL" fica fora do ranking, mas é publicado — em todas as páginas
    // da área, para não sumir quando o ranking se divide.
    const noteY = BODY.bottom - 26;
    box(doc, CONTENT.x, noteY, CONTENT.width, 22, group.semResponsavel > 0 ? "#F7E9E9" : COLOR.marble);
    box(doc, CONTENT.x, noteY, 3.5, 22, group.semResponsavel > 0 ? COLOR.danger : COLOR.textDim);
    text(
      doc,
      `OS da ${group.label} sem responsável: ${fmtInt(group.semResponsavel)}` +
        (group.semResponsavel > 0
          ? "  —  excluídas do ranking individual por não terem a quem atribuir; seguem contadas no total da área."
          : "  —  todas as ordens da área têm responsável preenchido."),
      CONTENT.x + 14,
      noteY + 7,
      { size: 8, color: COLOR.text, width: CONTENT.width - 24 }
    );
  });
}

/** PÁGINA 8 — serviços terceirizados (ranking + aderência geral da área). */
function renderThirdParties(doc: Doc, dataset: AdherenceReportDataset) {
  const group = dataset.colaboradores.find((item) => item.area === "TERCEIROS");
  if (!group) return;

  const pages = chunk(group.rows, COLLABORATORS_PER_PAGE);

  pages.forEach((rows, pageIndex) => {
    const suffix = pages.length > 1 ? ` (${pageIndex + 1}/${pages.length})` : "";
    newPage(
      doc,
      dataset,
      `Aderência aos serviços terceirizados${suffix}`,
      "Grupo de planejamento “Serviço Terceiro”, por responsável/cadastro vinculado"
    );

    const cardWidth = (CONTENT.width - 3 * 12) / 4;
    const cards = [
      { label: "Total de OS", value: fmtInt(group.totals.total), hint: "serviços terceirizados", accent: COLOR.goldDeep },
      { label: "Fechadas", value: fmtInt(group.totals.fechadas), hint: "tecnicamente encerradas", accent: COLOR.success },
      { label: "Pendentes", value: fmtInt(group.totals.abertas), hint: "em aberto", accent: COLOR.danger },
      {
        label: "Aderência da área",
        value: fmtPct(group.totals.aderencia),
        hint: "fechadas ÷ total",
        accent: adherenceColor(group.totals.aderencia)
      }
    ];
    cards.forEach((card, index) => {
      kpiCard(doc, CONTENT.x + index * (cardWidth + 12), BODY.top - 6, cardWidth, 70, card.label, card.value, card.hint, card.accent);
    });

    const tableY = BODY.top + 92;

    if (rows.length === 0) {
      text(doc, "Nenhuma ordem de serviço terceirizada com responsável preenchido no período selecionado.", CONTENT.x, tableY, {
        size: 9.5,
        color: COLOR.textDim,
        width: CONTENT.width
      });
    } else {
      const columns: Column[] = [
        { header: "Responsável", width: 290, value: (r) => r.responsavel },
        { header: "Total de OS", width: 120, align: "right", value: (r) => r.total },
        { header: "Fechadas", width: 120, align: "right", value: (r) => r.fechadas },
        { header: "Pendentes", width: 120, align: "right", value: (r) => r.pendentes },
        {
          header: "Aderência",
          width: 112,
          align: "right",
          value: (r) => r.aderencia,
          color: (r) => adherenceColor(r.raw === "" ? null : Number(r.raw))
        }
      ];

      table(
        doc,
        CONTENT.x,
        tableY,
        columns,
        rows.map((row) => ({
          responsavel: row.responsavel,
          total: fmtInt(row.total),
          fechadas: fmtInt(row.fechadas),
          pendentes: fmtInt(row.pendentes),
          aderencia: fmtPct(row.aderencia),
          raw: row.aderencia === null ? "" : String(row.aderencia)
        })),
        20
      );
    }

    const noteY = BODY.bottom - 26;
    box(doc, CONTENT.x, noteY, CONTENT.width, 22, group.semResponsavel > 0 ? "#F7E9E9" : COLOR.marble);
    box(doc, CONTENT.x, noteY, 3.5, 22, group.semResponsavel > 0 ? COLOR.danger : COLOR.textDim);
    text(
      doc,
      `OS de Terceiros sem responsável: ${fmtInt(group.semResponsavel)}` +
        (group.semResponsavel > 0
          ? "  —  fora do detalhamento por responsável, mas dentro do total e da aderência da área."
          : "  —  todas as ordens da área têm responsável preenchido."),
      CONTENT.x + 14,
      noteY + 7,
      { size: 8, color: COLOR.text, width: CONTENT.width - 24 }
    );
  });
}

/** PÁGINA FINAL — qualidade dos dados e metodologia. */
function renderDataQuality(doc: Doc, dataset: AdherenceReportDataset) {
  newPage(doc, dataset, "Qualidade dos dados", "Transparência sobre o que entrou e o que ficou de fora do relatório");

  const cardWidth = (CONTENT.width - 3 * 12) / 4;
  const cards = [
    {
      label: "OS consideradas",
      value: fmtInt(dataset.qualidade.consideradas),
      hint: "Mecânica + Elétrica + Terceiros",
      accent: COLOR.goldDeep
    },
    {
      label: "OS sem responsável",
      value: fmtInt(dataset.qualidade.semResponsavel),
      hint: "fora dos rankings individuais",
      accent: dataset.qualidade.semResponsavel > 0 ? COLOR.warning : COLOR.success
    },
    {
      label: "OS sem grupo de planej.",
      value: fmtInt(dataset.qualidade.semGrupoPlanejamento),
      hint: "não classificáveis por área",
      accent: dataset.qualidade.semGrupoPlanejamento > 0 ? COLOR.warning : COLOR.success
    },
    {
      label: "OS sem data-base",
      value: fmtInt(dataset.qualidade.semDataBase),
      hint: "sem data-base de início",
      accent: dataset.qualidade.semDataBase > 0 ? COLOR.warning : COLOR.success
    }
  ];
  cards.forEach((card, index) => {
    kpiCard(doc, CONTENT.x + index * (cardWidth + 12), BODY.top, cardWidth, 78, card.label, card.value, card.hint, card.accent);
  });

  const notesY = BODY.top + 100;
  text(doc, "METODOLOGIA", CONTENT.x, notesY - 16, { size: 9, bold: true, color: COLOR.goldDeep });

  const notes: string[] = [
    `Período analisado: ${dataset.periodo.label}. TODOS os gráficos e tabelas deste relatório usam exatamente este mesmo recorte — não há página com corte diferente do declarado na capa.`,
    "Campo de data: data-base de início da ordem (o mesmo campo do filtro de período da tela). A data de importação da planilha não é usada em nenhum cálculo.",
    "OS fechada: ordem com status “Tecnicamente encerrado” do SAP (normalizado como FECHADA na importação). OS em aberto: todos os demais status do recorte — aberta, liberada, em andamento, aguardando material e cancelada.",
    "Aderência (%) = OS tecnicamente encerradas ÷ total de OS consideradas × 100. Quando não há nenhuma OS no recorte, o relatório imprime “—” em vez de 0%.",
    "Unidade de contagem: a ORDEM DE SERVIÇO, não a linha da planilha. Cada ordem chega do SAP com uma linha por operação (uma preventiva elétrica pode ter 13), e contá-las como ordens multiplicaria o volume das áreas com plano de operações.",
    "Áreas: classificação pelo GRUPO DE PLANEJAMENTO do SAP — “Manut. Mecanica” → Mecânica, “Manut. Eletrica” → Elétrica, “Serviço Terceiro” → Terceiros. O título da ordem não é usado para classificar área.",
    `Fora do escopo: ${fmtInt(dataset.qualidade.foraDasAreas)} ordem(ns) do período pertencem a outros grupos de planejamento (Lubrificação, Usinagem, Automação) ou não têm grupo, e não entram em nenhum número deste relatório.`,
    `Leitura da base: ${fmtInt(dataset.qualidade.linhasOperacao)} linha(s) de operação consolidadas em ${fmtInt(dataset.qualidade.consideradas + dataset.qualidade.foraDasAreas)} ordem(ns) distinta(s).`,
    dataset.filtros.usouFiltrosDaTela
      ? dataset.filtros.descricao.length
        ? `Filtros da tela aplicados: ${dataset.filtros.descricao.join(" · ")}.`
        : "Filtros da tela aplicados: além do período, nenhum filtro adicional estava ativo."
      : "Filtros da tela NÃO aplicados: o recorte é apenas o período informado na geração."
  ];

  let cursorY = notesY;
  for (const note of notes) {
    box(doc, CONTENT.x, cursorY + 3, 3, 3, COLOR.gold);
    cursorY += paragraph(doc, note, CONTENT.x + 12, cursorY, CONTENT.width - 16, { size: 8.5, lineGap: 1.5 }) + 8;
  }
}

/** Estampa "Página X de Y" depois que o total de páginas é conhecido. */
function stampPageNumbers(doc: Doc) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // A capa não recebe numeração.
    if (index === range.start) continue;
    text(doc, `Página ${index + 1} de ${range.count}`, CONTENT.x, PAGE.height - 30, {
      size: 7.5,
      color: COLOR.textDim,
      width: CONTENT.width,
      align: "right"
    });
  }
}

/* ------------------------------------------------------------------ */
/* Entrada pública                                                    */
/* ------------------------------------------------------------------ */

/**
 * Renderiza o dataset como PDF e devolve o arquivo inteiro em memória.
 *
 * O buffer completo (e não um stream) porque a rota precisa do
 * `Content-Length` para o navegador mostrar progresso de download — e o relatório
 * tem algumas centenas de KB, não centenas de MB.
 */
export function renderAdherenceReportPdf(dataset: AdherenceReportDataset): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        /**
         * Margem INFERIOR pequena de propósito. Todo o layout é posicionado em
         * coordenadas absolutas, então a margem aqui só governa uma coisa: a
         * partir de que Y o pdfkit decide que um texto "não cabe" e ABRE UMA
         * PÁGINA sozinho. Com os 40pt padrão, o rodapé (y=565) caía abaixo do
         * limite e cada página interna gerava uma página em branco logo depois —
         * o relatório de 11 páginas saía com 21.
         */
        margins: { top: MARGIN, bottom: 8, left: MARGIN, right: MARGIN },
        // `bufferPages` permite voltar às páginas no fim para numerá-las.
        bufferPages: true,
        autoFirstPage: false,
        info: {
          Title: `Aderência (%) à execução das ordens de serviços — ${dataset.periodo.titleLabel}`,
          Author: "Portal de Gestão da Manutenção Zucchi",
          Subject: `PCM · Aderência à conclusão de O.S. · ${dataset.periodo.label}`,
          Creator: "Portal de Gestão da Manutenção Zucchi"
        }
      });

      const chunks: Buffer[] = [];
      doc.on("data", (piece: Buffer) => chunks.push(piece));
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      doc.addPage();
      renderCover(doc, dataset);
      renderExecutiveSummary(doc, dataset);
      renderMonthlyByArea(doc, dataset);
      renderOpenVsClosed(doc, dataset);
      renderCountsByArea(doc, dataset);

      const mecanica = dataset.colaboradores.find((group) => group.area === "MECANICA");
      if (mecanica) renderCollaborators(doc, dataset, mecanica, "Aderência por colaborador — Mecânica");

      const eletrica = dataset.colaboradores.find((group) => group.area === "ELETRICA");
      if (eletrica) renderCollaborators(doc, dataset, eletrica, "Aderência por colaborador — Elétrica");

      renderThirdParties(doc, dataset);
      renderDataQuality(doc, dataset);

      stampPageNumbers(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

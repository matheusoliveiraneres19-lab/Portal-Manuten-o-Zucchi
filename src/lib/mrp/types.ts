/**
 * ANÁLISE MRP — tipos compartilhados da importação (FASE C).
 * Nomes de campo em inglês (como no banco); os comentários apontam o nome
 * original no `Analise_MRP_Compacto (1).html`.
 */
import type { MrpAliasField } from "./aliases";

/** Tipo de planilha (`TIPOS`/`ORDEM` do HTML). A ordem importa no encaixe dos slots. */
export const MRP_FILE_KINDS = ["base", "est", "cmp"] as const;
export type MrpFileKind = (typeof MRP_FILE_KINDS)[number];

export const MRP_FILE_KIND_LABELS: Record<MrpFileKind, string> = {
  base: "Planilha do MRP",
  est: "Estoque",
  cmp: "Compras"
};

/** ImportType (Prisma) de cada tipo de planilha. */
export const MRP_FILE_KIND_IMPORT_TYPE = {
  base: "MRP_BASE",
  est: "MRP_STOCK",
  cmp: "MRP_PURCHASES"
} as const satisfies Record<MrpFileKind, string>;

export function isMrpFileKind(value: unknown): value is MrpFileKind {
  return typeof value === "string" && (MRP_FILE_KINDS as readonly string[]).includes(value);
}

export type MrpRow = unknown[];

/** Uma aba já lida: linha de cabeçalho escolhida + linhas de dados. */
export type MrpSheetTable = {
  sheet: string;
  /** Índice do cabeçalho dentro das linhas não vazias (findHeaderRow). */
  headerRowIndex: number;
  /** Linha do cabeçalho na planilha (1-based, como no Excel). */
  headerSheetRow: number;
  /** `aoa[hr].map(cleanText)` */
  headers: string[];
  /** `aoa.slice(hr + 1)` — linhas de dados não vazias. */
  rows: MrpRow[];
  /** Linha na planilha (1-based) de cada item de `rows`. */
  rowNumbers: number[];
  /** `linhas` do HTML = aoa.length - hr - 1. */
  dataRows: number;
};

/** `pontuar()` */
export type MrpScores = { est: number; cmp: number; base: number };

export type MrpConfidence = "HIGH" | "MEDIUM" | "LOW";

export type MrpSheetCandidate = {
  sheet: string;
  headerRowIndex: number;
  dataRows: number;
  scores: MrpScores;
  score: number;
  kind: MrpFileKind;
};

/** Resultado de analisarArquivo() + informações extras do Portal. */
export type MrpFileDetection = {
  fileName: string;
  sheetNames: string[];
  /** Tipo detectado (`info.tipo`). */
  kind: MrpFileKind;
  table: MrpSheetTable;
  scores: MrpScores;
  score: number;
  candidates: MrpSheetCandidate[];
};

/** Diagnóstico de uma planilha num slot (tipo + aba escolhidos). */
export type MrpSlotDiagnosis = {
  /** colunasOk(kind, headers) */
  requiredColumnsOk: boolean;
  missingRequired: MrpAliasField[];
  /** Coluna reconhecida para cada campo do ALIAS (texto do cabeçalho). */
  recognizedColumns: Partial<Record<MrpAliasField, string>>;
  confidence: MrpConfidence;
  warnings: string[];
};

export type MrpSlots<T> = Record<MrpFileKind, T | null>;

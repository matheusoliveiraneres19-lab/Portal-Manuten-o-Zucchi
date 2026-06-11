/**
 * Funções puras de classificação do "Nome Status Recurso" do PC-Factory.
 * Sem dependência de Prisma ou React — testáveis isoladamente.
 *
 * REGRA DE NEGÓCIO CENTRAL (manutenção): entram como manutenção SOMENTE os três
 * status exatos abaixo. A comparação é por valor EXATO normalizado — NUNCA por
 * `contains("Manutenção")` — para que "Manutenção Automação" e "Manutenção de
 * Terceiros" NÃO sejam contabilizados como manutenção:
 *   - Manutenção Mecânica
 *   - Manutenção Elétrica
 *   - Aguardando Manutenção
 */
import { PcFactoryStatusCategory } from "@prisma/client";

/* ------------------------------------------------------------------ */
/* Normalização de texto para comparação                              */
/* ------------------------------------------------------------------ */

/**
 * Normaliza o "Nome Status Recurso" para comparação:
 * remove espaços extras, trata acentos e caixa. NÃO altera o valor gravado em
 * statusRaw (esse é preservado na íntegra na importação).
 */
export function normalizePcFactoryStatusName(value: unknown): string {
  return String(value ?? "")
    .replace(/ /g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Chaves normalizadas dos status reais da planilha                   */
/* ------------------------------------------------------------------ */

const KEY = {
  MANUTENCAO_MECANICA: "manutencao mecanica",
  MANUTENCAO_ELETRICA: "manutencao eletrica",
  AGUARDANDO_MANUTENCAO: "aguardando manutencao",
  FORA_DE_TURNO: "fora de turno",
  RECURSO_NAO_PROGRAMADO: "recurso nao programado",
  PRODUCAO: "producao",
  SETUP: "setup",
  FALTA_DE_MATERIAL: "falta de material",
  PARADA_NAO_IDENTIFICADA: "parada nao identificada",
  REFEICAO: "refeicao",
  AGUARDANDO_LANCAMENTO: "aguardando lancamento",
  MANUTENCAO_AUTOMACAO: "manutencao automacao",
  MANUTENCAO_TERCEIROS: "manutencao de terceiros"
} as const;

/** Os três (e apenas três) status que contam como manutenção. */
const MAINTENANCE_KEYS = new Set<string>([
  KEY.MANUTENCAO_MECANICA,
  KEY.MANUTENCAO_ELETRICA,
  KEY.AGUARDANDO_MANUTENCAO
]);

const EXCLUDED_PLANNED_KEYS = new Set<string>([KEY.FORA_DE_TURNO, KEY.RECURSO_NAO_PROGRAMADO]);

/** Status de parada/perda operacional (não-manutenção) para o cálculo. */
const OPERATIONAL_LOSS_KEYS = new Set<string>([
  KEY.SETUP,
  KEY.FALTA_DE_MATERIAL,
  KEY.PARADA_NAO_IDENTIFICADA
]);

/* ------------------------------------------------------------------ */
/* Classificação gerencial                                            */
/* ------------------------------------------------------------------ */

const CATEGORY_BY_KEY: Record<string, PcFactoryStatusCategory> = {
  [KEY.MANUTENCAO_MECANICA]: PcFactoryStatusCategory.MANUTENCAO,
  [KEY.MANUTENCAO_ELETRICA]: PcFactoryStatusCategory.MANUTENCAO,
  [KEY.AGUARDANDO_MANUTENCAO]: PcFactoryStatusCategory.MANUTENCAO,
  [KEY.FORA_DE_TURNO]: PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO,
  [KEY.RECURSO_NAO_PROGRAMADO]: PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO,
  [KEY.PRODUCAO]: PcFactoryStatusCategory.PRODUCAO,
  [KEY.SETUP]: PcFactoryStatusCategory.SETUP,
  [KEY.FALTA_DE_MATERIAL]: PcFactoryStatusCategory.PARADA_PERDA,
  [KEY.PARADA_NAO_IDENTIFICADA]: PcFactoryStatusCategory.PARADA_PERDA,
  [KEY.REFEICAO]: PcFactoryStatusCategory.OPERACIONAL,
  [KEY.AGUARDANDO_LANCAMENTO]: PcFactoryStatusCategory.OUTROS,
  [KEY.MANUTENCAO_AUTOMACAO]: PcFactoryStatusCategory.OUTROS,
  [KEY.MANUTENCAO_TERCEIROS]: PcFactoryStatusCategory.OUTROS
};

/**
 * Classifica o "Nome Status Recurso" em categoria gerencial.
 * Status desconhecido → OUTROS. Note que "Manutenção Automação" e
 * "Manutenção de Terceiros" caem explicitamente em OUTROS (não em MANUTENCAO).
 */
export function classifyPcFactoryStatus(statusRaw: unknown): PcFactoryStatusCategory {
  const key = normalizePcFactoryStatusName(statusRaw);
  return CATEGORY_BY_KEY[key] ?? PcFactoryStatusCategory.OUTROS;
}

/* ------------------------------------------------------------------ */
/* Funções booleanas (regras explícitas, por valor exato)            */
/* ------------------------------------------------------------------ */

/** true SOMENTE para Manutenção Mecânica, Manutenção Elétrica e Aguardando Manutenção. */
export function isMaintenanceStatus(statusRaw: unknown): boolean {
  return MAINTENANCE_KEYS.has(normalizePcFactoryStatusName(statusRaw));
}

export function isMechanicalMaintenance(statusRaw: unknown): boolean {
  return normalizePcFactoryStatusName(statusRaw) === KEY.MANUTENCAO_MECANICA;
}

export function isElectricalMaintenance(statusRaw: unknown): boolean {
  return normalizePcFactoryStatusName(statusRaw) === KEY.MANUTENCAO_ELETRICA;
}

export function isWaitingMaintenance(statusRaw: unknown): boolean {
  return normalizePcFactoryStatusName(statusRaw) === KEY.AGUARDANDO_MANUTENCAO;
}

/** true para Fora de Turno e Recurso Não Programado (saem do tempo planejado). */
export function isExcludedFromPlannedTime(statusRaw: unknown): boolean {
  return EXCLUDED_PLANNED_KEYS.has(normalizePcFactoryStatusName(statusRaw));
}

/** true para Produção. */
export function isProductiveStatus(statusRaw: unknown): boolean {
  return normalizePcFactoryStatusName(statusRaw) === KEY.PRODUCAO;
}

/** true para Setup, Falta de Material e Parada não Identificada. */
export function isOperationalLossStatus(statusRaw: unknown): boolean {
  return OPERATIONAL_LOSS_KEYS.has(normalizePcFactoryStatusName(statusRaw));
}

/** Sub-tipo de manutenção do registro, ou null se não for manutenção. */
export type MaintenanceKind = "MECANICA" | "ELETRICA" | "AGUARDANDO";

export function maintenanceKind(statusRaw: unknown): MaintenanceKind | null {
  const key = normalizePcFactoryStatusName(statusRaw);
  if (key === KEY.MANUTENCAO_MECANICA) return "MECANICA";
  if (key === KEY.MANUTENCAO_ELETRICA) return "ELETRICA";
  if (key === KEY.AGUARDANDO_MANUTENCAO) return "AGUARDANDO";
  return null;
}

/* ------------------------------------------------------------------ */
/* Rótulos e cores das categorias (UI premium)                        */
/* ------------------------------------------------------------------ */

export const PC_FACTORY_CATEGORY_LABELS: Record<PcFactoryStatusCategory, string> = {
  MANUTENCAO: "Manutenção",
  PRODUCAO: "Produção",
  SETUP: "Setup",
  PARADA_PERDA: "Parada/perda",
  OPERACIONAL: "Operacional",
  EXCLUIR_TEMPO_PLANEJADO: "Fora do tempo planejado",
  OUTROS: "Outros"
};

export const PC_FACTORY_CATEGORY_COLORS: Record<PcFactoryStatusCategory, string> = {
  MANUTENCAO: "#c49a45",
  PRODUCAO: "#3f8f6b",
  SETUP: "#0f4d68",
  PARADA_PERDA: "#a6192e",
  OPERACIONAL: "#6b7280",
  EXCLUIR_TEMPO_PLANEJADO: "#4b5563",
  OUTROS: "#9ca3af"
};

export const PC_FACTORY_CATEGORY_ORDER: PcFactoryStatusCategory[] = [
  PcFactoryStatusCategory.PRODUCAO,
  PcFactoryStatusCategory.MANUTENCAO,
  PcFactoryStatusCategory.SETUP,
  PcFactoryStatusCategory.PARADA_PERDA,
  PcFactoryStatusCategory.OPERACIONAL,
  PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO,
  PcFactoryStatusCategory.OUTROS
];

/* ------------------------------------------------------------------ */
/* Datas e duração (inalterado — conversões da planilha)              */
/* ------------------------------------------------------------------ */

import { converterDataExcel, converterNumeroBrasileiro, limparTexto } from "@/utils/importacao";

/** Converte data/hora da planilha (serial Excel, dd/mm/aaaa hh:mm, ISO, Date). */
export function parsePcFactoryDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return converterDataExcel(value);
  }

  const text = limparTexto(value);
  if (!text) {
    return null;
  }

  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]) - 1;
    const year = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    const hours = Number(br[4] ?? 0);
    const minutes = Number(br[5] ?? 0);
    const seconds = Number(br[6] ?? 0);
    const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return converterDataExcel(text);
}

/** Combina uma data (Date) com um horário textual ("HH:MM"/"HH:MM:SS" ou fração Excel). */
export function combineDateAndTime(date: Date | null, timeValue: unknown): Date | null {
  if (!date) return null;
  if (timeValue === undefined || timeValue === null || timeValue === "") return date;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (typeof timeValue === "number" && Number.isFinite(timeValue)) {
    const fraction = timeValue >= 1 ? timeValue - Math.floor(timeValue) : timeValue;
    const total = Math.round(fraction * 24 * 60 * 60);
    hours = Math.floor(total / 3600) % 24;
    minutes = Math.floor((total % 3600) / 60);
    seconds = total % 60;
  } else {
    const match = limparTexto(timeValue).match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/);
    if (!match) return date;
    hours = Number(match[1]);
    minutes = Number(match[2]);
    seconds = Number(match[3] ?? 0);
  }

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes, seconds)
  );
}

/** Converte a duração para minutos (número em minutos, fração do dia Excel, hh:mm, "1,5h", "90 min"). */
export function parseDurationToMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 0 && value < 1) {
      return round(value * 24 * 60);
    }
    return round(value);
  }

  const text = limparTexto(value).toLowerCase();
  if (!text) {
    return null;
  }

  const clock = text.match(/^(\d{1,4}):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (clock) {
    return round(Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3] ?? 0) / 60);
  }

  const hoursMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas|hr|hrs)$/);
  if (hoursMatch) {
    const hours = converterNumeroBrasileiro(hoursMatch[1]);
    return hours === null ? null : round(hours * 60);
  }

  const minutesMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:m|min|minuto|minutos)$/);
  if (minutesMatch) {
    return converterNumeroBrasileiro(minutesMatch[1]);
  }

  return converterNumeroBrasileiro(text);
}

/** Calcula a duração em minutos a partir do delta início→fim, com fallback no valor da coluna. */
export function computeDurationMinutes(start: Date | null, end: Date | null, fallback: number | null): number {
  if (start && end) {
    const deltaMs = end.getTime() - start.getTime();
    if (deltaMs > 0) {
      return round(deltaMs / 60000);
    }
  }
  return fallback !== null && fallback >= 0 ? round(fallback) : 0;
}

export function normalizeResourceName(value: unknown): string {
  return limparTexto(value);
}

export function normalizeProductionLine(value: unknown): string | null {
  const text = limparTexto(value);
  return text || null;
}

/** Chave técnica para deduplicação na reimportação. */
export function buildPcFactoryTechnicalKey(parts: {
  resourceName: string;
  resourceCode: string | null;
  startDateTime: Date | null;
  statusRaw: string | null;
  durationMinutes: number;
  orderNumber: string | null;
}): string {
  return [
    parts.resourceCode || parts.resourceName,
    parts.startDateTime ? parts.startDateTime.toISOString() : "",
    normalizePcFactoryStatusName(parts.statusRaw),
    parts.durationMinutes,
    parts.orderNumber ?? ""
  ].join("|");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

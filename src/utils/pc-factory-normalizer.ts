/**
 * Funções puras de normalização da planilha do PC-Factory.
 * Sem dependência de Prisma ou React — testáveis isoladamente.
 *
 * O importador é flexível de propósito: a planilha real do PC-Factory ainda
 * pode mudar de layout, então o mapeamento de status e colunas é tolerante.
 */
import { PcFactoryStatus } from "@prisma/client";
import { converterDataExcel, converterNumeroBrasileiro, limparTexto } from "@/utils/importacao";

/** Status considerados "parada" (indisponibilidade que não é manutenção). */
export const STOPPED_STATUSES: PcFactoryStatus[] = [
  PcFactoryStatus.PARADA,
  PcFactoryStatus.AGUARDANDO,
  PcFactoryStatus.FALTA_MATERIAL,
  PcFactoryStatus.SEM_OPERADOR,
  PcFactoryStatus.INATIVO
];

/** Status que contam como "falha" para MTBF (parada + manutenção). */
export const FAILURE_STATUSES: PcFactoryStatus[] = [PcFactoryStatus.PARADA, PcFactoryStatus.MANUTENCAO];

/** Rótulos amigáveis dos status. */
export const PC_FACTORY_STATUS_LABELS: Record<PcFactoryStatus, string> = {
  PRODUCAO: "Produção",
  PARADA: "Parada",
  MANUTENCAO: "Manutenção",
  SETUP: "Setup",
  AGUARDANDO: "Aguardando",
  SEM_OPERADOR: "Sem operador",
  FALTA_MATERIAL: "Falta de material",
  LIMPEZA: "Limpeza",
  QUALIDADE: "Qualidade",
  INATIVO: "Inativo",
  OUTROS: "Outros"
};

/** Cores premium dos status (paleta Zucchi: verde produção, vermelho parada, dourado manutenção). */
export const PC_FACTORY_STATUS_COLORS: Record<PcFactoryStatus, string> = {
  PRODUCAO: "#3f8f6b",
  PARADA: "#a6192e",
  MANUTENCAO: "#c49a45",
  SETUP: "#0f4d68",
  AGUARDANDO: "#8a6d3b",
  SEM_OPERADOR: "#6b7280",
  FALTA_MATERIAL: "#b45309",
  LIMPEZA: "#2563eb",
  QUALIDADE: "#7c3aed",
  INATIVO: "#4b5563",
  OUTROS: "#9ca3af"
};

/** Ordem canônica de exibição (produção primeiro, depois indisponibilidades). */
export const PC_FACTORY_STATUS_ORDER: PcFactoryStatus[] = [
  PcFactoryStatus.PRODUCAO,
  PcFactoryStatus.MANUTENCAO,
  PcFactoryStatus.SETUP,
  PcFactoryStatus.PARADA,
  PcFactoryStatus.AGUARDANDO,
  PcFactoryStatus.FALTA_MATERIAL,
  PcFactoryStatus.SEM_OPERADOR,
  PcFactoryStatus.LIMPEZA,
  PcFactoryStatus.QUALIDADE,
  PcFactoryStatus.INATIVO,
  PcFactoryStatus.OUTROS
];

function normalizeKey(value: unknown): string {
  return limparTexto(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

/**
 * Mapeia o status bruto da planilha para o enum normalizado.
 * Aceita variações de grafia e acentuação. Desconhecido → OUTROS.
 */
export function normalizePcFactoryStatus(value: unknown): PcFactoryStatus {
  const key = normalizeKey(value);
  if (!key) {
    return PcFactoryStatus.OUTROS;
  }

  const map: Record<string, PcFactoryStatus> = {
    producao: PcFactoryStatus.PRODUCAO,
    produzindo: PcFactoryStatus.PRODUCAO,
    em_producao: PcFactoryStatus.PRODUCAO,
    operando: PcFactoryStatus.PRODUCAO,
    rodando: PcFactoryStatus.PRODUCAO,
    parado: PcFactoryStatus.PARADA,
    parada: PcFactoryStatus.PARADA,
    maquina_parada: PcFactoryStatus.PARADA,
    manutencao: PcFactoryStatus.MANUTENCAO,
    em_manutencao: PcFactoryStatus.MANUTENCAO,
    manutencao_corretiva: PcFactoryStatus.MANUTENCAO,
    manutencao_preventiva: PcFactoryStatus.MANUTENCAO,
    setup: PcFactoryStatus.SETUP,
    preparacao: PcFactoryStatus.SETUP,
    troca: PcFactoryStatus.SETUP,
    aguardando: PcFactoryStatus.AGUARDANDO,
    espera: PcFactoryStatus.AGUARDANDO,
    em_espera: PcFactoryStatus.AGUARDANDO,
    sem_operador: PcFactoryStatus.SEM_OPERADOR,
    falta_operador: PcFactoryStatus.SEM_OPERADOR,
    falta_material: PcFactoryStatus.FALTA_MATERIAL,
    sem_material: PcFactoryStatus.FALTA_MATERIAL,
    limpeza: PcFactoryStatus.LIMPEZA,
    qualidade: PcFactoryStatus.QUALIDADE,
    controle_qualidade: PcFactoryStatus.QUALIDADE,
    inativo: PcFactoryStatus.INATIVO,
    desligado: PcFactoryStatus.INATIVO,
    desligada: PcFactoryStatus.INATIVO
  };

  if (map[key]) {
    return map[key];
  }

  // Heurística por substring (planilha pode trazer texto livre).
  if (key.includes("manuten")) return PcFactoryStatus.MANUTENCAO;
  if (key.includes("setup") || key.includes("prepar") || key.includes("troca")) return PcFactoryStatus.SETUP;
  if (key.includes("material")) return PcFactoryStatus.FALTA_MATERIAL;
  if (key.includes("operador")) return PcFactoryStatus.SEM_OPERADOR;
  if (key.includes("limpez")) return PcFactoryStatus.LIMPEZA;
  if (key.includes("qualidade")) return PcFactoryStatus.QUALIDADE;
  if (key.includes("aguard") || key.includes("espera")) return PcFactoryStatus.AGUARDANDO;
  if (key.includes("inativ") || key.includes("deslig")) return PcFactoryStatus.INATIVO;
  if (key.includes("produ") || key.includes("operand") || key.includes("rodand")) return PcFactoryStatus.PRODUCAO;
  if (key.includes("parad")) return PcFactoryStatus.PARADA;

  return PcFactoryStatus.OUTROS;
}

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

  // dd/mm/aaaa hh:mm(:ss) — formato comum em exportações industriais brasileiras.
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

/**
 * Converte a duração para minutos. Aceita:
 *  - número (assumido em minutos, salvo fração do dia Excel < 1 → horas do dia);
 *  - "hh:mm" / "hh:mm:ss";
 *  - "1,5h" / "90 min" / "2 h";
 *  - número brasileiro ("1.234,5" minutos).
 * Quando há início e fim, o chamador pode preferir o delta — ver computeDurationMinutes.
 */
export function parseDurationToMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Fração do dia Excel (0–1) → horas; caso contrário, minutos.
    if (value > 0 && value < 1) {
      return round(value * 24 * 60);
    }
    return round(value);
  }

  const text = limparTexto(value).toLowerCase();
  if (!text) {
    return null;
  }

  // hh:mm:ss ou hh:mm
  const clock = text.match(/^(\d{1,4}):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const seconds = Number(clock[3] ?? 0);
    return round(hours * 60 + minutes + seconds / 60);
  }

  // "1,5 h" / "2h" / "0.5 hora(s)"
  const hoursMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas|hr|hrs)$/);
  if (hoursMatch) {
    const hours = converterNumeroBrasileiro(hoursMatch[1]);
    return hours === null ? null : round(hours * 60);
  }

  // "90 min" / "90 minutos" / "90m"
  const minutesMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:m|min|minuto|minutos)$/);
  if (minutesMatch) {
    return converterNumeroBrasileiro(minutesMatch[1]);
  }

  // Número puro (brasileiro) → minutos.
  return converterNumeroBrasileiro(text);
}

/** Calcula a duração em minutos a partir do delta início→fim, com fallback no valor da coluna. */
export function computeDurationMinutes(
  start: Date | null,
  end: Date | null,
  fallback: number | null
): number {
  if (start && end) {
    const deltaMs = end.getTime() - start.getTime();
    if (deltaMs > 0) {
      return round(deltaMs / 60000);
    }
  }
  return fallback !== null && fallback >= 0 ? round(fallback) : 0;
}

/** Normaliza o nome do recurso/máquina (texto limpo). */
export function normalizeResourceName(value: unknown): string {
  return limparTexto(value);
}

/** Normaliza o nome da linha de produção (texto limpo). */
export function normalizeProductionLine(value: unknown): string | null {
  const text = limparTexto(value);
  return text || null;
}

/**
 * Chave técnica para deduplicação na reimportação.
 * Combina recurso + início + status + duração (+ ordem quando houver).
 */
export function buildPcFactoryTechnicalKey(parts: {
  resourceName: string;
  resourceCode: string | null;
  startDateTime: Date | null;
  statusNormalized: string;
  durationMinutes: number;
  orderNumber: string | null;
}): string {
  return [
    parts.resourceCode || parts.resourceName,
    parts.startDateTime ? parts.startDateTime.toISOString() : "",
    parts.statusNormalized,
    parts.durationMinutes,
    parts.orderNumber ?? ""
  ].join("|");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

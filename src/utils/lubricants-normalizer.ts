/**
 * Funções puras de normalização da planilha de lubrificação (SAP/Fiori).
 * Sem dependência de Prisma ou React — testáveis isoladamente.
 */
import { LubricantMovementCategory } from "@prisma/client";
import { converterDataExcel, converterNumeroBrasileiro, limparTexto } from "@/utils/importacao";

/** Reaproveita o parser de número brasileiro (aceita "1.234,56", number, etc.). */
export function parseBrazilianNumber(value: unknown): number | null {
  return converterNumeroBrasileiro(value);
}

/** Reaproveita o conversor de datas (serial Excel, dd/mm/aaaa, ISO). */
export function parseExcelDate(value: unknown): Date | null {
  return converterDataExcel(value);
}

/** Normaliza o código do material (remove espaços/zeros à esquerda não são removidos — mantém SAP fiel). */
export function normalizeMaterialCode(value: unknown): string {
  return limparTexto(value).replace(/\s+/g, "");
}

/** Normaliza a descrição do material (texto limpo, sem múltiplos espaços). */
export function normalizeMaterialDescription(value: unknown): string {
  return limparTexto(value);
}

/**
 * Hora do registro: aceita "10:15:00", "10:15", número (fração do dia Excel) ou Date.
 * Retorna sempre no formato HH:MM:SS, ou null.
 */
export function parseExcelTime(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatTimeParts(value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Fração do dia (0–1) ou serial Excel com parte fracionária representando a hora.
    const fraction = value >= 1 ? value - Math.floor(value) : value;
    const totalSeconds = Math.round(fraction * 24 * 60 * 60);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return formatTimeParts(hours, minutes, seconds);
  }

  const text = limparTexto(value);
  if (!text) {
    return null;
  }

  const match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/);
  if (match) {
    return formatTimeParts(Number(match[1]), Number(match[2]), Number(match[3] ?? 0));
  }

  return null;
}

function formatTimeParts(hours: number, minutes: number, seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Classifica a movimentação a partir do sinal da quantidade e do tipo de movimento SAP.
 * Regras de negócio:
 *  - quantidade < 0  -> SAIDA (consumo / SM para ordem 261).
 *  - quantidade > 0 e tipo 101 (EM Entrada mercador.) -> ENTRADA.
 *  - quantidade > 0 e tipo 561 (Reg.inic.estq.sist.)  -> ESTOQUE_INICIAL.
 *  - demais positivos -> AJUSTE.
 */
export function classifyLubricantMovement(quantity: number, movementTypeCode?: string | null): LubricantMovementCategory {
  if (quantity < 0) {
    return LubricantMovementCategory.SAIDA;
  }

  const code = (movementTypeCode ?? "").trim();
  if (quantity > 0) {
    if (code === "101") {
      return LubricantMovementCategory.ENTRADA;
    }
    if (code === "561") {
      return LubricantMovementCategory.ESTOQUE_INICIAL;
    }
    return LubricantMovementCategory.AJUSTE;
  }

  return LubricantMovementCategory.AJUSTE;
}

/**
 * Chave técnica para deduplicação de movimentações na reimportação.
 * Combina material + data + hora + tipo + quantidade + depósito.
 */
export function buildLubricantMovementTechnicalKey(parts: {
  materialCode: string;
  movementDate: Date;
  movementTime: string | null;
  movementTypeCode: string | null;
  quantity: number;
  storageLocation: string | null;
}): string {
  return [
    parts.materialCode,
    parts.movementDate.toISOString().slice(0, 10),
    parts.movementTime ?? "",
    parts.movementTypeCode ?? "",
    parts.quantity,
    parts.storageLocation ?? ""
  ].join("|");
}

/** Rótulos amigáveis das categorias de movimento. */
export const LUBRICANT_CATEGORY_LABELS: Record<LubricantMovementCategory, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  ESTOQUE_INICIAL: "Estoque inicial",
  AJUSTE: "Ajuste"
};

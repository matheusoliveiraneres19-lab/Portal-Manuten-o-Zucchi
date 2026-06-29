import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SETTINGS } from "@/constants/portal-settings-defaults";
import type { PortalSettingDTO, SettingValue, SettingValueType } from "@/types/settings";

/** Erro de validação amigável (mapeado para 400 nas rotas). */
export class SettingValidationError extends Error {}

function toDTO(row: {
  category: string;
  key: string;
  label: string;
  description: string | null;
  value: Prisma.JsonValue;
  valueType: string;
  isEditable: boolean;
  updatedBy: string | null;
  updatedAt: Date;
}): PortalSettingDTO {
  return {
    category: row.category,
    key: row.key,
    label: row.label,
    description: row.description,
    value: row.value as SettingValue,
    valueType: row.valueType as SettingValueType,
    isEditable: row.isEditable,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString()
  };
}

/**
 * Carrega TODAS as configurações uma vez por request (dedupe via React.cache).
 * Usado por getSettingValue() para que vários módulos compartilhem o mesmo fetch.
 */
const loadAllSettings = cache(async (): Promise<Map<string, SettingValue>> => {
  const map = new Map<string, SettingValue>();
  try {
    const rows = await prisma.portalSetting.findMany({ select: { category: true, key: true, value: true } });
    for (const row of rows) {
      map.set(`${row.category}:${row.key}`, row.value as SettingValue);
    }
  } catch (error) {
    // Tabela ausente ou banco indisponível → segue só com fallbacks do código.
    console.error("Falha ao carregar PortalSetting; usando fallbacks do código.", error);
  }
  return map;
});

export async function getSettings(): Promise<PortalSettingDTO[]> {
  const rows = await prisma.portalSetting.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] });
  return rows.map(toDTO);
}

export async function getSettingsByCategory(category: string): Promise<PortalSettingDTO[]> {
  const rows = await prisma.portalSetting.findMany({
    where: { category },
    orderBy: { key: "asc" }
  });
  return rows.map(toDTO);
}

export async function getSetting(category: string, key: string): Promise<PortalSettingDTO | null> {
  const row = await prisma.portalSetting.findUnique({ where: { category_key: { category, key } } });
  return row ? toDTO(row) : null;
}

/**
 * Valor de uma configuração com FALLBACK garantido. Nunca lança: se a linha não
 * existir (ou o banco falhar), devolve o fallback informado pelo chamador.
 */
export async function getSettingValue<T extends SettingValue>(
  category: string,
  key: string,
  fallback: T
): Promise<T> {
  const map = await loadAllSettings();
  const value = map.get(`${category}:${key}`);
  return (value === undefined || value === null ? fallback : (value as T));
}

/** Valida e normaliza o valor conforme o tipo declarado no default. */
function validateValue(valueType: SettingValueType, raw: unknown): SettingValue {
  switch (valueType) {
    case "percent": {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new SettingValidationError("O percentual deve estar entre 0 e 100.");
      }
      return n;
    }
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        throw new SettingValidationError("Informe um número válido maior ou igual a zero.");
      }
      return n;
    }
    case "text": {
      const text = String(raw ?? "").trim();
      if (!text) throw new SettingValidationError("O valor não pode ficar vazio.");
      return text;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      if (raw === "true" || raw === "1") return true;
      if (raw === "false" || raw === "0") return false;
      throw new SettingValidationError("Valor booleano inválido.");
    }
    case "select": {
      const text = String(raw ?? "").trim();
      if (!text) throw new SettingValidationError("Selecione uma opção.");
      return text;
    }
    case "wordlist": {
      const arr = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
      const cleaned: string[] = [];
      const seen = new Set<string>();
      for (const item of arr) {
        const word = String(item).trim();
        if (!word) continue;
        const lower = word.toLowerCase();
        if (seen.has(lower)) continue; // sem duplicidade
        seen.add(lower);
        cleaned.push(word);
      }
      return cleaned;
    }
    default:
      throw new SettingValidationError("Tipo de configuração desconhecido.");
  }
}

/**
 * Atualiza uma configuração existente. Valida o tipo, bloqueia regras não
 * editáveis e registra updatedBy. Não cria chaves desconhecidas.
 */
export async function updateSetting(
  category: string,
  key: string,
  rawValue: unknown,
  userId?: string
): Promise<PortalSettingDTO> {
  const existing = await prisma.portalSetting.findUnique({ where: { category_key: { category, key } } });
  if (!existing) {
    throw new SettingValidationError("Configuração não encontrada.");
  }
  if (!existing.isEditable) {
    throw new SettingValidationError("Esta configuração é somente leitura.");
  }

  const value = validateValue(existing.valueType as SettingValueType, rawValue);

  const updated = await prisma.portalSetting.update({
    where: { category_key: { category, key } },
    data: { value: value as Prisma.InputJsonValue, updatedBy: userId ?? null }
  });
  return toDTO(updated);
}

/**
 * Cria as configurações padrão que ainda não existem. Idempotente e NÃO
 * sobrescreve valores já salvos (respeita "não alterar dados existentes").
 */
export async function seedDefaultSettings(): Promise<{ created: number; total: number }> {
  const existing = await prisma.portalSetting.findMany({ select: { category: true, key: true } });
  const existingKeys = new Set(existing.map((row) => `${row.category}:${row.key}`));

  const missing = DEFAULT_SETTINGS.filter((s) => !existingKeys.has(`${s.category}:${s.key}`));
  if (missing.length) {
    await prisma.portalSetting.createMany({
      data: missing.map((s) => ({
        category: s.category,
        key: s.key,
        label: s.label,
        description: s.description ?? null,
        value: s.value as Prisma.InputJsonValue,
        valueType: s.valueType,
        isEditable: s.isEditable ?? true
      })),
      skipDuplicates: true
    });
  }

  return { created: missing.length, total: DEFAULT_SETTINGS.length };
}

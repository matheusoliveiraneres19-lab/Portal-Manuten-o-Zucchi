// Tipos das configurações administrativas do portal (PortalSetting).

export type SettingValueType = "number" | "percent" | "text" | "boolean" | "wordlist" | "select";

export type SettingValue = number | string | boolean | string[];

export type SettingCategory =
  | "geral"
  | "metas"
  | "ordens"
  | "preventivas"
  | "pc_factory"
  | "compras"
  | "procedimentos"
  | "alertas";

/** Configuração serializável enviada ao client (sem objetos Prisma/Date). */
export type PortalSettingDTO = {
  category: string;
  key: string;
  label: string;
  description: string | null;
  value: SettingValue;
  valueType: SettingValueType;
  isEditable: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

/** Definição de um padrão de configuração (fonte única para seed e fallback). */
export type SettingDefault = {
  category: SettingCategory;
  key: string;
  label: string;
  description?: string;
  value: SettingValue;
  valueType: SettingValueType;
  /** false = somente leitura na UI (regra crítica/derivada). Default true. */
  isEditable?: boolean;
  /** Opções para valueType "select". */
  options?: string[];
};

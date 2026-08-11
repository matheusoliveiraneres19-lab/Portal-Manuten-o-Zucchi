/**
 * Normalização CENTRAL de Grupo de Planejamento e Tipo de Atividade de
 * Planejamento das Ordens de Manutenção (SAP PM/Fiori).
 *
 * Fonte ÚNICA das regras (TAREFAS 2 e 4): a aba Equipamentos Críticos, o
 * importador e qualquer indicador futuro devem consumir estas funções — nunca
 * reimplementar a classificação em componente ou em outro service.
 *
 * Puro: sem Prisma client e sem React (apenas tipos), para poder ser usado tanto
 * no importador quanto nos serviços de leitura.
 */

/* ------------------------------------------------------------------ */
/* Grupo de planejamento                                              */
/* ------------------------------------------------------------------ */

export type PlanningGroupKey = "ELE" | "MEC" | "SERVICO_TERCEIRO" | "LUB" | "USINAGEM" | "OUTROS";

/** Rótulos gerenciais exibidos nos dashboards. */
export const PLANNING_GROUP_LABELS: Record<PlanningGroupKey, string> = {
  MEC: "Mecânica",
  ELE: "Elétrica",
  SERVICO_TERCEIRO: "Serviço Terceiro",
  LUB: "Lubrificação",
  USINAGEM: "Usinagem",
  OUTROS: "Outros"
};

/** Ordem oficial de exibição do dashboard "Ordens por Grupo de Planejamento". */
export const PLANNING_GROUP_ORDER: PlanningGroupKey[] = [
  "MEC",
  "ELE",
  "SERVICO_TERCEIRO",
  "LUB",
  "USINAGEM",
  "OUTROS"
];

/** Cores premium Zucchi para cada grupo (usadas em barras/rosca). */
export const PLANNING_GROUP_COLORS: Record<PlanningGroupKey, string> = {
  MEC: "#2f6384",
  ELE: "#c49a45",
  SERVICO_TERCEIRO: "#7a5a16",
  LUB: "#3f8f6b",
  USINAGEM: "#8a6fa8",
  OUTROS: "#6b7280"
};

/**
 * Normaliza o GRUPO DE PLANEJAMENTO vindo do SAP para uma chave estável.
 *
 * Regras (TAREFA 2), tolerantes a acento, caixa, pontuação e abreviações:
 *  - `ELE`, Elétrica, Eletrica, Manut. Elétrica, Manutencao Eletrica -> `ELE`
 *  - `MEC`, Mecânica, Mecanica, Manut. Mecânica, Manutencao Mecanica -> `MEC`
 *  - Terceiro, Serviço Terceiro, Manut. Terceiros, Terceiros -> `SERVICO_TERCEIRO`
 *  - `LUB`, Lubrificação, Lubrificacao -> `LUB`
 *  - Usinagem, `USI`, Oficina, Torno, Fresadora -> `USINAGEM`
 *  - vazio / não reconhecido -> `OUTROS`
 *
 * A ordem dos testes importa: "Terceiro" é verificado antes de mecânica/elétrica
 * porque rótulos como "Manut. Terceiros Mecânica" existem no SAP.
 */
export function normalizePlanningGroup(value: unknown): PlanningGroupKey {
  const compact = compactUpper(value);
  if (!compact) {
    return "OUTROS";
  }

  if (compact.includes("TERCEIR")) {
    return "SERVICO_TERCEIRO";
  }
  if (compact.includes("LUBRIF") || compact === "LUB" || compact === "PL") {
    return "LUB";
  }
  if (
    compact.includes("USINAG") ||
    compact.includes("OFICINA") ||
    compact.includes("TORNO") ||
    compact.includes("FRESAD") ||
    compact === "USI"
  ) {
    return "USINAGEM";
  }
  if (compact.includes("ELETRIC") || compact === "ELE") {
    return "ELE";
  }
  if (compact.includes("MECANIC") || compact === "MEC") {
    return "MEC";
  }

  return "OUTROS";
}

/** Subconjunto de campos da OS necessários para resolver grupo e atividade. */
export type PlanningClassifiableOrder = {
  planningGroup?: string | null;
  planningGroupCode?: string | null;
  planningActivityType?: string | null;
  maintenanceType?: string | null;
  orderType?: string | null;
  /** Enum `MaintenanceType` do Prisma (quando importado). */
  type?: string | null;
  title?: string | null;
  operation?: string | null;
  description?: string | null;
};

/**
 * Resolve o grupo de planejamento de uma ORDEM: tenta o rótulo e, se cair em
 * "Outros", tenta o código (ex.: rótulo ausente e código "MEC"). O código "001"
 * do SAP (Serviço Terceiro) não é auto-descritivo — por isso o rótulo tem
 * prioridade e o código é apenas um reforço.
 */
export function resolvePlanningGroup(order: PlanningClassifiableOrder): PlanningGroupKey {
  const byLabel = normalizePlanningGroup(order.planningGroup);
  if (byLabel !== "OUTROS") {
    return byLabel;
  }
  return normalizePlanningGroup(order.planningGroupCode);
}

/* ------------------------------------------------------------------ */
/* Tipo de atividade de planejamento                                  */
/* ------------------------------------------------------------------ */

export type PlanningActivityTypeKey =
  | "CORRETIVA"
  | "PREVENTIVA"
  | "MELHORIA"
  | "INSPECAO"
  | "LUBRIFICACAO"
  | "PREDITIVA"
  | "PLANEJADA"
  | "OUTROS";

/** Rótulos gerenciais exibidos nos dashboards. */
export const PLANNING_ACTIVITY_LABELS: Record<PlanningActivityTypeKey, string> = {
  CORRETIVA: "Corretiva",
  PREVENTIVA: "Preventiva",
  MELHORIA: "Melhoria",
  INSPECAO: "Inspeção",
  LUBRIFICACAO: "Lubrificação",
  PREDITIVA: "Preditiva",
  PLANEJADA: "Planejada",
  OUTROS: "Outros"
};

/** Ordem oficial de exibição do dashboard "Ordens por Tipo de Atividade". */
export const PLANNING_ACTIVITY_ORDER: PlanningActivityTypeKey[] = [
  "CORRETIVA",
  "PREVENTIVA",
  "MELHORIA",
  "INSPECAO",
  "LUBRIFICACAO",
  "PREDITIVA",
  "PLANEJADA",
  "OUTROS"
];

/** Cores premium Zucchi por tipo de atividade. */
export const PLANNING_ACTIVITY_COLORS: Record<PlanningActivityTypeKey, string> = {
  CORRETIVA: "#b51f32",
  PREVENTIVA: "#3f8f6b",
  MELHORIA: "#2f6384",
  INSPECAO: "#3f7da6",
  LUBRIFICACAO: "#c49a45",
  PREDITIVA: "#8a6fa8",
  PLANEJADA: "#7a5a16",
  OUTROS: "#6b7280"
};

/**
 * Tabela de reconhecimento do TIPO DE ATIVIDADE (TAREFA 4). Avaliada NESTA
 * ordem — o primeiro padrão que casar vence.
 */
const ACTIVITY_PATTERNS: Array<{ key: PlanningActivityTypeKey; tokens: string[]; exact?: string[] }> = [
  { key: "CORRETIVA", tokens: ["CORRETIV", "CORRECAO", "CORRET", "EMERGENC", "QUEBRA", "FALHA"] },
  { key: "PREVENTIVA", tokens: ["PREVENTIV", "PREV"], exact: ["PV"] },
  { key: "MELHORIA", tokens: ["MELHORI", "MODIFICAC", "RETROFIT", "KAIZEN"] },
  { key: "INSPECAO", tokens: ["INSPEC", "CHECKLIST"] },
  { key: "LUBRIFICACAO", tokens: ["LUBRIF"], exact: ["PL", "LUB"] },
  { key: "PREDITIVA", tokens: ["PREDITIV", "TERMOGRAF", "VIBRAC", "ANALISE"] },
  { key: "PLANEJADA", tokens: ["PLANEJAD", "PROGRAMAD"] }
];

/** Casa um texto livre contra a tabela de atividades; `null` quando nada casa. */
function matchActivityText(value: unknown): PlanningActivityTypeKey | null {
  const compact = compactUpper(value);
  if (!compact) {
    return null;
  }
  for (const pattern of ACTIVITY_PATTERNS) {
    if (pattern.exact?.includes(compact)) {
      return pattern.key;
    }
    if (pattern.tokens.some((token) => compact.includes(token))) {
      return pattern.key;
    }
  }
  return null;
}

/**
 * Casa apenas o PREFIXO de um texto livre (título/operação/descrição) contra a
 * tabela. O SAP escreve a atividade no início do texto ("PL - ...", "Correção -
 * ...", "LUBRIFICAÇÃO 300HRS"); varrer o texto inteiro geraria falso-positivo —
 * ex.: "Preventiva - Falha em sensor" cairia em CORRETIVA por causa de "FALHA".
 */
function matchActivityTextPrefix(value: unknown): PlanningActivityTypeKey | null {
  const raw = typeof value === "string" ? value : "";
  if (!raw.trim()) {
    return null;
  }
  const prefix = raw.split("-")[0] || raw;
  return matchActivityText(prefix);
}

/** Prefixo de plano programado do SAP no título: "PL -" (lubrificação) / "PV -" (preventiva). */
function matchProgrammedPlanPrefix(title: unknown): PlanningActivityTypeKey | null {
  const raw = typeof title === "string" ? title : "";
  const match = raw.match(/^\s*(PL|PV)\s*-/i);
  if (!match) {
    return null;
  }
  return match[1].toUpperCase() === "PL" ? "LUBRIFICACAO" : "PREVENTIVA";
}

/** Mapeia o enum `MaintenanceType` do Prisma para a chave de atividade. */
function matchMaintenanceEnum(value: unknown): PlanningActivityTypeKey | null {
  const compact = compactUpper(value);
  const map: Record<string, PlanningActivityTypeKey> = {
    CORRETIVA: "CORRETIVA",
    PREVENTIVA: "PREVENTIVA",
    PREDITIVA: "PREDITIVA",
    MELHORIA: "MELHORIA",
    INSPECAO: "INSPECAO"
  };
  return map[compact] ?? null;
}

/**
 * Normaliza o TIPO DE ATIVIDADE DE PLANEJAMENTO (TAREFA 4).
 *
 * Dois modos:
 *
 *  1. **Campo importado presente** (`value` com texto) — normaliza estritamente
 *     pela tabela de regras; valor não reconhecido vira `OUTROS`.
 *
 *  2. **Campo ausente na base** (`value` vazio) — quando a `order` é informada,
 *     a classificação é DERIVADA, nesta ordem de confiança:
 *       a) prefixo de plano programado no título: "PL -" -> `LUBRIFICACAO`,
 *          "PV -" -> `PREVENTIVA` (regra oficial do portal, a mesma da aba
 *          Preventivas Programadas);
 *       b) enum `MaintenanceType` (`type`), quando importado;
 *       c) palavras-chave no título / operação / descrição;
 *       d) grupo de planejamento de Lubrificação -> `LUBRIFICACAO`;
 *       e) fallback `CORRETIVA` — ordem que não nasceu de plano é, no SAP PM,
 *          demanda não planejada. É a MESMA regra já usada em
 *          `dashboard.service.getCorrectivePreventiveChart`, o que mantém os
 *          números coerentes entre as abas.
 *
 * Sem `value` e sem `order`, devolve `OUTROS` (nunca inventa classificação).
 */
export function normalizePlanningActivityType(
  value: unknown,
  order?: PlanningClassifiableOrder
): PlanningActivityTypeKey {
  const explicit = matchActivityText(value);
  if (explicit) {
    return explicit;
  }
  // Campo veio preenchido mas não bate com nenhuma regra -> "Outros" (não deriva).
  if (compactUpper(value)) {
    return "OUTROS";
  }
  if (!order) {
    return "OUTROS";
  }

  return (
    matchActivityText(order.planningActivityType) ??
    matchActivityText(order.maintenanceType) ??
    matchProgrammedPlanPrefix(order.title) ??
    matchMaintenanceEnum(order.type) ??
    matchActivityTextPrefix(order.title) ??
    matchActivityTextPrefix(order.operation) ??
    matchActivityTextPrefix(order.description) ??
    (resolvePlanningGroup(order) === "LUB" ? "LUBRIFICACAO" : null) ??
    "CORRETIVA"
  );
}

/** Resolve o tipo de atividade de uma ORDEM (campo importado + derivação). */
export function resolvePlanningActivityType(order: PlanningClassifiableOrder): PlanningActivityTypeKey {
  return normalizePlanningActivityType(order.planningActivityType, order);
}

/* ------------------------------------------------------------------ */
/* Corretiva x Planejada                                              */
/* ------------------------------------------------------------------ */

/** Classe gerencial da ordem para o dashboard "Corretivas x Planejadas". */
export type OrderClass = "CORRETIVA" | "PLANEJADA" | "NAO_CLASSIFICADA";

/** Valor do filtro de classe (TAREFA 12). */
export type OrderClassFilter = "TODAS" | "CORRETIVA" | "PLANEJADA";

/** Rótulos do filtro Corretiva/Planejada/Todas. */
export const ORDER_CLASS_LABELS: Record<OrderClassFilter, string> = {
  TODAS: "Todas as ordens",
  CORRETIVA: "Somente corretivas",
  PLANEJADA: "Somente planejadas"
};

/** Tipos de atividade que compõem o bloco PLANEJADAS (TAREFA 6). */
export const PLANNED_ACTIVITY_TYPES: PlanningActivityTypeKey[] = [
  "PREVENTIVA",
  "MELHORIA",
  "INSPECAO",
  "LUBRIFICACAO",
  "PREDITIVA",
  "PLANEJADA"
];

/**
 * Converte o tipo de atividade na classe gerencial:
 *  - `CORRETIVA` -> corretiva;
 *  - Preventiva + Melhoria + Inspeção + Lubrificação + Preditiva + Planejada -> planejada;
 *  - `OUTROS` -> não classificada (não entra em nenhum dos dois totais).
 */
export function toOrderClass(activity: PlanningActivityTypeKey): OrderClass {
  if (activity === "CORRETIVA") {
    return "CORRETIVA";
  }
  if (PLANNED_ACTIVITY_TYPES.includes(activity)) {
    return "PLANEJADA";
  }
  return "NAO_CLASSIFICADA";
}

/** Classe gerencial de uma ORDEM (atalho de `resolvePlanningActivityType` + `toOrderClass`). */
export function resolveOrderClass(order: PlanningClassifiableOrder): OrderClass {
  return toOrderClass(resolvePlanningActivityType(order));
}

/** Aceita/rejeita uma ordem conforme o filtro Corretiva/Planejada/Todas. */
export function matchesOrderClassFilter(order: PlanningClassifiableOrder, filter: OrderClassFilter): boolean {
  if (filter === "TODAS") {
    return true;
  }
  return resolveOrderClass(order) === filter;
}

/** Normaliza o parâmetro de URL do filtro de classe. */
export function parseOrderClassFilter(value: unknown): OrderClassFilter {
  const compact = compactUpper(value);
  if (compact === "CORRETIVA" || compact === "CORRETIVAS") {
    return "CORRETIVA";
  }
  if (compact === "PLANEJADA" || compact === "PLANEJADAS") {
    return "PLANEJADA";
  }
  return "TODAS";
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Normaliza texto para comparação: sem acento, MAIÚSCULO e sem pontuação/espaços.
 * Ex.: "Manut. Elétrica" -> "MANUTELETRICA"; "Serviço Terceiro" -> "SERVICOTERCEIRO".
 */
function compactUpper(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
}

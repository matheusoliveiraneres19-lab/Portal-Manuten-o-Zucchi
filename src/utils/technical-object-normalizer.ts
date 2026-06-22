/**
 * Normalizador de Objeto Técnico / Local de Instalação das Ordens de Serviço.
 *
 * Reconhece o CÓDIGO TÉCNICO (local de instalação) da máquina a partir de:
 *  - código explícito (equipmentCode);
 *  - código embutido no texto do objeto técnico, inclusive entre parênteses
 *    (ex.: "MULTIFIO 06 (ZC-SR-G07-MF-0006)");
 *  - padrão hifenizado tipo ZC-SR-G07-MF-0006 ou ZC-INDUSTRIA-GALPAO-MAQUINA-SEQ.
 *
 * É usado como CHAVE de agrupamento de equipamentos, para que as ordens caiam na
 * máquina correta mesmo quando `equipmentCode` não veio preenchido pelo SAP/Fiori.
 *
 * Puro: sem Prisma e sem React — pode ser importado em qualquer camada.
 */

/** Token de código técnico: 3+ segmentos alfanuméricos separados por hífen/underscore. */
const CODE_TOKEN = /[A-Z0-9]+(?:[-_][A-Z0-9]+){2,}/g;

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Normaliza um código técnico para a forma canônica: maiúsculas, sem acentos,
 * separador "-", sem espaços ao redor do hífen e sem hifens nas pontas.
 * Ex.: " zc-sr-g07-mf-0006 " -> "ZC-SR-G07-MF-0006".
 */
export function normalizeTechnicalObjectCode(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return stripDiacritics(value)
    .toUpperCase()
    .replace(/\s*[-_]\s*/g, "-") // normaliza separadores e remove espaços ao redor
    .replace(/-+/g, "-") // colapsa hifens repetidos
    .replace(/^-+|-+$/g, "") // remove hifens nas pontas
    .trim();
}

/** Seleciona o primeiro token que pareça código técnico dentro de um trecho. */
function pickCodeToken(chunk: string): string {
  const normalized = chunk.replace(/\s*[-_]\s*/g, "-");
  const matches = normalized.match(CODE_TOKEN);

  if (!matches || matches.length === 0) {
    return "";
  }

  // Prefere token que começa com letras (ex.: ZC-...); senão, o mais longo.
  const preferred =
    matches.find((token) => /^[A-Z]{2,}/.test(token)) ??
    [...matches].sort((a, b) => b.length - a.length)[0];

  return normalizeTechnicalObjectCode(preferred);
}

/**
 * Extrai o código técnico (local de instalação) de um texto livre.
 * Prioriza conteúdo entre parênteses (o último parêntese vence, ex.: descrição
 * seguida do código); depois procura um token hifenizado no texto. Retorna ""
 * quando nada casa.
 */
export function extractTechnicalObjectCode(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const upper = stripDiacritics(value).toUpperCase();

  // 1) Conteúdo entre parênteses que pareça código (último parêntese vence).
  const parenContents = Array.from(upper.matchAll(/\(([^)]+)\)/g), (match) => match[1]);
  for (const candidate of parenContents.reverse()) {
    const code = pickCodeToken(candidate);
    if (code) {
      return code;
    }
  }

  // 2) Token hifenizado em qualquer lugar do texto.
  return pickCodeToken(upper);
}

/**
 * Prefixo da máquina (família): remove a sequência numérica final do código.
 * Ex.: "ZC-SR-G07-MF-0006" -> "ZC-SR-G07-MF". Sem sequência final, retorna o código.
 */
export function extractMachinePrefix(value: string | null | undefined): string {
  const code = normalizeTechnicalObjectCode(value);
  if (!code) {
    return "";
  }

  const segments = code.split("-");
  if (segments.length > 1 && /^\d+$/.test(segments[segments.length - 1])) {
    return segments.slice(0, -1).join("-");
  }

  return code;
}

export type EquipmentGroupingKey = {
  /** Chave de agrupamento estável da máquina. */
  key: string;
  /** Código técnico / local de instalação resolvido (ou "" quando ausente). */
  code: string;
  /** Prefixo da máquina (família), derivado do código. */
  prefix: string;
  /** Nome legível do equipamento, quando houver. */
  name: string;
  /** true quando NÃO há código técnico estruturado (fallback por nome). */
  dataQualityIssue: boolean;
};

type GroupingInput = {
  equipmentCode?: string | null;
  equipmentName?: string | null;
  technicalObjectRaw?: string | null;
};

/**
 * Resolve a chave de agrupamento do equipamento a partir de uma Ordem de Serviço:
 *  1) equipmentCode explícito;
 *  2) código extraído do Objeto Técnico (technicalObjectRaw);
 *  3) fallback por nome (marca dataQualityIssue = true).
 */
export function getEquipmentGroupingKey(order: GroupingInput): EquipmentGroupingKey {
  const name = (order.equipmentName ?? "").trim();

  const explicit = normalizeTechnicalObjectCode(order.equipmentCode);
  if (explicit) {
    return { key: explicit, code: explicit, prefix: extractMachinePrefix(explicit), name, dataQualityIssue: false };
  }

  const extracted = extractTechnicalObjectCode(order.technicalObjectRaw);
  if (extracted) {
    return { key: extracted, code: extracted, prefix: extractMachinePrefix(extracted), name, dataQualityIssue: false };
  }

  const nameKey = name ? `nome:${stripDiacritics(name).toUpperCase()}` : "sem-id";
  return { key: nameKey, code: "", prefix: "", name, dataQualityIssue: true };
}

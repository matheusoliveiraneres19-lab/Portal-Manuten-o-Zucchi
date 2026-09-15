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
/* ------------------------------------------------------------------ */
/* Nome de máquina/recurso — exibição e agrupamento (FASE 3)          */
/* ------------------------------------------------------------------ */

/**
 * Siglas e nomes próprios que precisam sobreviver à normalização de caixa.
 * "BM" viraria "Bm", "Skystone" viraria "SKYSTONE" — os dois erros descaracterizam
 * o nome que o time usa no chão de fábrica.
 */
const MACHINE_NAME_TOKENS: Record<string, string> = {
  bm: "BM",
  g03: "G03",
  g04: "G04",
  g05: "G05",
  g07: "G07",
  g08: "G08",
  g09: "G09",
  gasp: "Gasp",
  gaspari: "Gaspari",
  skystone: "Skystone",
  simec: "Simec",
  breton: "Breton",
  keda: "Keda",
  bidese: "Bidese",
  pcm: "PCM",
  eta: "ETA"
};

/**
 * Erros de grafia conhecidos da base, corrigidos SÓ na exibição.
 *
 * "Multfio" (sem o i) existe em 5 dos 83 recursos do PC-Factory e é digitação, não
 * outra máquina. Corrigir aqui evita que a mesma família apareça escrita de dois
 * jeitos na mesma lista — mas não altera o valor gravado nem a chave de agrupamento.
 */
// Sem \b no fim: o nome legado vem colado ao número ("MULTFIO3"), e não existe
// fronteira de palavra entre letra e dígito.
const MACHINE_NAME_FIXES: Array<[RegExp, string]> = [[/\bmultfio/gi, "Multifio"]];

/**
 * NOME DE MÁQUINA NORMALIZADO PARA EXIBIÇÃO.
 *
 * Corrige o que é ruído de digitação e só isso: espaços duplicados, espaçamento do
 * hífen ("Multfio 07 -Skystone" → "Multifio 07 - Skystone"), caixa de nomes legados
 * em CAIXA ALTA ("TEAR03" → "Tear03") e a grafia "Multfio". Siglas e nomes próprios
 * (BM, Gasp, Skystone, Simec, G07...) são preservados.
 *
 * NÃO funde máquinas: "MULTFIO3" e "Multifio 03 - BM" continuam sendo dois recursos
 * distintos depois disto. Fundir exigiria uma chave técnica confiável, e o
 * `resourceCode` do PC-Factory está 100% nulo na base atual — casar por nome seria
 * adivinhação, e adivinhar identidade de ativo é pior que exibir dois nomes.
 *
 * Uso: rótulo de filtro, título de gráfico, célula de tabela. Para agrupar, use
 * `getMachineCanonicalKey`.
 */
export function normalizeMachineName(value: unknown): string {
  if (typeof value !== "string") return "";

  let name = value.replace(/\s+/g, " ").trim();
  if (!name) return "";

  for (const [pattern, replacement] of MACHINE_NAME_FIXES) {
    name = name.replace(pattern, replacement);
  }

  // Hífen separador ganha espaço dos dois lados; hífen dentro de código não.
  name = name.replace(/\s*-\s*/g, (match, offset: number) => {
    const antes = name[offset - 1];
    const depois = name[offset + match.length];
    const colado = /[A-Za-z0-9]/.test(antes ?? "") && /[A-Za-z0-9]/.test(depois ?? "");
    // "LR03-G08" (sem espaço na origem) fica como está; "Multifio 04 - BM" idem.
    return colado && !/\s/.test(match) ? "-" : " - ";
  });

  return name
    .split(" ")
    .map((token) => {
      const chave = token.toLowerCase();
      if (MACHINE_NAME_TOKENS[chave]) return MACHINE_NAME_TOKENS[chave];
      // Só normaliza a caixa de tokens inteiramente maiúsculos e alfabéticos:
      // "TEAR03" → "Tear03"; "LR03-G08" e "PZ-13S" ficam como estão (têm hífen/número).
      if (/^[A-ZÁÂÃÀÉÊÍÓÔÕÚÇ]{3,}\d*$/.test(token)) {
        return token.charAt(0) + token.slice(1).toLowerCase();
      }
      return token;
    })
    .join(" ");
}

/** Um registro que identifica uma máquina: código técnico e/ou nome. */
export type MachineIdentifiable = {
  resourceCode?: string | null;
  resourceName?: string | null;
  equipmentCode?: string | null;
  equipmentName?: string | null;
};

/**
 * CHAVE TÉCNICA da máquina, para agrupar.
 *
 * Prioridade: código do recurso/equipamento quando existir (é a identidade real do
 * ativo no SAP/PC-Factory); só na ausência dele cai para o nome normalizado.
 *
 * A distinção importa: o nome muda de grafia entre importações, o código não. Onde
 * houver código, agrupar por nome é que produz as duplicidades que a gestão viu.
 */
export function getMachineCanonicalKey(record: MachineIdentifiable): string {
  const code = normalizeTechnicalObjectCode(record.resourceCode ?? record.equipmentCode ?? "");
  if (code) return code;

  return normalizeMachineName(record.resourceName ?? record.equipmentName ?? "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Nome para MOSTRAR: normalizado, com o valor bruto como último recurso. */
export function getMachineDisplayName(record: MachineIdentifiable): string {
  const raw = record.resourceName ?? record.equipmentName ?? "";
  return normalizeMachineName(raw) || raw.trim() || "Não informado";
}

/**
 * Rotula uma lista de máquinas sem criar rótulos ambíguos.
 *
 * Se dois nomes distintos normalizarem para o MESMO rótulo, os dois voltam ao valor
 * bruto — duas linhas idênticas num filtro são piores que duas grafias diferentes,
 * porque o usuário não tem como saber qual escolher.
 */
export function labelMachineNames(rawNames: string[]): Map<string, string> {
  const porRotulo = new Map<string, string[]>();
  for (const raw of rawNames) {
    const rotulo = getMachineDisplayName({ resourceName: raw });
    porRotulo.set(rotulo, [...(porRotulo.get(rotulo) ?? []), raw]);
  }

  const resultado = new Map<string, string>();
  for (const [rotulo, brutos] of Array.from(porRotulo.entries())) {
    for (const bruto of brutos) {
      resultado.set(bruto, brutos.length > 1 ? bruto : rotulo);
    }
  }
  return resultado;
}

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

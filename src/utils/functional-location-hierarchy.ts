/**
 * Hierarquia de LOCAIS DE INSTALAÇÃO (SAP PM / Fiori) — resolução do EQUIPAMENTO
 * RAIZ a partir do local de instalação técnico de uma Ordem de Manutenção.
 *
 * Regra gerencial (Equipamentos Críticos): toda OS aberta numa RAMIFICAÇÃO
 * (componente) deve somar para o EQUIPAMENTO PRINCIPAL. Ex.:
 *
 *   ZC-SR-G07-MF-0004-RM-04-01  (ROLO MOVIDO MF04)     ─┐
 *   ZC-SR-G07-MF-0004-PE-04-01  (PAINEL ELÉTRICO MF04) ─┼─►  ZC-SR-G07-MF-0004
 *   ZC-SR-G07-MF-0004-CH-04-01  (CHUVEIRO MF04)        ─┘     (MULTIFIO 04)
 *
 * Como a RAIZ é encontrada (TAREFA 6): a raiz é o maior prefixo do TAG até o
 * padrão FAMÍLIA(2+ letras) + NÚMERO DA MÁQUINA(3-4 dígitos), que é a identidade
 * do equipamento principal (ex.: `MF-0004`, `LR-0004`, `PZ-0002`). O que vem
 * depois (`-RM-04-01`) é o componente. Quando NÃO existe esse padrão, a própria
 * máquina é folha (ex.: `...-PR-00-10` = PONTE ROLANTE 10) e a raiz é o próprio
 * TAG — assim NÃO agrupamos pontes rolantes/carros dentro de um "Suporte Galpão".
 *
 * Nunca subimos até fábrica/setor/galpão/centro genérico: o padrão FAMÍLIA-NÚMERO
 * (não-greedy, primeira ocorrência) nunca casa com os prefixos de site
 * (ZC, EX, ID, Gnn), pois estes não são seguidos de um número de 3-4 dígitos.
 *
 * Fallback seguro (TAREFA 5): sem TAG estruturado, usa-se o próprio identificador
 * (código/nome) como raiz e marca-se `dataQualityIssue` — nunca agrupamos por
 * texto genérico.
 *
 * Camada OPCIONAL de enriquecimento: quando a planilha "Local de Instalação.xlsx"
 * é importada (model FunctionalLocation), um lookup por TAG pode fornecer a
 * descrição oficial, o centro de custo e a raiz autoritativa — sobrepondo a
 * resolução estrutural. Sem a planilha, tudo funciona só com o padrão do TAG.
 *
 * Puro: sem Prisma e sem React — importável em qualquer camada. Reaproveita o
 * normalizador de objeto técnico existente (fonte única do parsing de TAG).
 */
import { extractTechnicalObjectCode, normalizeTechnicalObjectCode } from "@/utils/technical-object-normalizer";

/**
 * Padrão do EQUIPAMENTO RAIZ: prefixo até FAMÍLIA(2+ letras)-NÚMERO(3-4 dígitos).
 * `.*?` não-greedy garante a PRIMEIRA ocorrência (a máquina, não um componente).
 */
const ROOT_MACHINE_PATTERN = /^(.*?-[A-Z]{2,}-\d{3,4})(?:-.*)?$/;

/** Segmento de família imediatamente antes de um número puro (2-4 dígitos). */
const FAMILY_BEFORE_NUMBER = /-([A-Z]{2,})-\d{2,4}(?=-|$)/g;

/**
 * Rótulos gerenciais das famílias de equipamento (código de 2-3 letras do TAG).
 * Fallback: quando o código não está mapeado, exibimos o próprio código — nunca
 * um texto genérico. Ajuste/expanda conforme a planilha de locais evoluir.
 */
export const EQUIPMENT_FAMILY_LABELS: Record<string, string> = {
  MF: "Multifio",
  PZ: "Politriz",
  LR: "Linha de Resina",
  LV: "Lavadora",
  PR: "Ponte Rolante",
  CT: "Carro Transportador",
  GT: "Giratória de Carros",
  RN: "Rampa Niveladora",
  PT: "Estação de Bombas",
  ET: "Estação de Tratamento",
  SP: "Suporte / Galpão",
  TR: "Tear",
  CP: "Compressor",
  CL: "Caldeira",
  ES: "Esteira",
  FR: "Forno",
  EX: "Exaustor"
};

export type FunctionalLocationRoot = {
  /** TAG da raiz (equipamento principal). Ex.: ZC-SR-G07-MF-0004. */
  rootTag: string;
  /** Descrição legível da raiz. Ex.: MULTIFIO 04. */
  rootDescription: string;
  /** TAG do componente quando a OS está numa ramificação (senão indefinido). */
  componentTag?: string;
  /** Descrição do componente quando a OS está numa ramificação. */
  componentDescription?: string;
  /** Código da família (ex.: MF) derivado da raiz. */
  familyCode: string;
  /** Rótulo gerencial da família (ex.: Multifio) ou o próprio código. */
  familyLabel: string;
  /** Centro de custo (só quando enriquecido pela planilha de locais). */
  costCenter?: string;
  /** true quando NÃO há TAG estruturado (raiz = próprio identificador). */
  dataQualityIssue: boolean;
};

/** Registro leve de FunctionalLocation para o lookup opcional (sem Prisma). */
export type FunctionalLocationLite = {
  tag: string;
  description?: string | null;
  costCenter?: string | null;
  rootTag?: string | null;
  rootDescription?: string | null;
  equipmentFamily?: string | null;
};

/** Entrada mínima (subconjunto da Ordem de Manutenção) para resolver a raiz. */
export type RootResolvableOrder = {
  equipmentCode?: string | null;
  equipmentName?: string | null;
  technicalObjectRaw?: string | null;
};

/** Rótulo gerencial da família a partir do código (ou o próprio código). */
export function getFamilyLabel(familyCode: string): string {
  const code = familyCode.trim().toUpperCase();
  return EQUIPMENT_FAMILY_LABELS[code] ?? code;
}

/**
 * Resolve o TAG da raiz (equipamento principal) a partir de um código/local de
 * instalação já normalizado. Retorna o próprio código quando é folha ou quando o
 * padrão FAMÍLIA-NÚMERO não é encontrado.
 */
export function resolveRootTag(normalizedCode: string): string {
  if (!normalizedCode) {
    return "";
  }
  const match = normalizedCode.match(ROOT_MACHINE_PATTERN);
  return match ? match[1] : normalizedCode;
}

/** Extrai o código da família do TAG da raiz (último FAMÍLIA-antes-de-número). */
export function extractFamilyCode(rootTag: string): string {
  const matches = Array.from(rootTag.matchAll(FAMILY_BEFORE_NUMBER), (m) => m[1]);
  if (matches.length > 0) {
    return matches[matches.length - 1];
  }
  // Sem FAMÍLIA-NÚMERO: usa o último segmento puramente alfabético (2+ letras).
  const segments = rootTag.split("-").filter((seg) => /^[A-Z]{2,}$/.test(seg));
  return segments.length ? segments[segments.length - 1] : "";
}

/** Número da máquina a partir do TAG da raiz, sempre com 2+ dígitos. Ex.: 0004 -> 04, 10 -> 10. */
function extractMachineNumber(rootTag: string): string {
  // Último grupo numérico do TAG (identifica a máquina/sequência).
  const trailing = rootTag.match(/(\d{2,4})(?!.*\d)/);
  const raw = trailing?.[1] ?? "";
  if (!raw) {
    return "";
  }
  const trimmed = raw.replace(/^0+/, "");
  if (!trimmed) {
    return ""; // ex.: "0000" (nó genérico) — descrição fica só com a família
  }
  return trimmed.padStart(2, "0");
}

/**
 * Sintetiza uma descrição gerencial da raiz quando nenhuma fonte melhor existe
 * (planilha ou OS na própria raiz). Ex.: MF-0004 -> "Multifio 04".
 */
export function synthesizeRootDescription(rootTag: string): string {
  const family = getFamilyLabel(extractFamilyCode(rootTag));
  const number = extractMachineNumber(rootTag);
  if (family && number) {
    return `${family} ${number}`.trim();
  }
  return family || rootTag;
}

/**
 * Resolve o EQUIPAMENTO RAIZ de uma OS a partir do local de instalação técnico.
 *
 * Ordem de fontes do TAG: equipmentCode explícito → código extraído do objeto
 * técnico → (fallback) sem TAG estruturado.
 *
 * @param order   subconjunto da OS (código, nome, objeto técnico).
 * @param lookup  (opcional) Map por TAG normalizado com dados da planilha de
 *                locais — quando presente, enriquece/sobrepõe a resolução.
 */
export function getRootFunctionalLocation(
  order: RootResolvableOrder,
  lookup?: Map<string, FunctionalLocationLite>
): FunctionalLocationRoot {
  const name = (order.equipmentName ?? "").trim();
  const explicit = normalizeTechnicalObjectCode(order.equipmentCode);
  const code = explicit || extractTechnicalObjectCode(order.technicalObjectRaw);

  // Fallback seguro: sem TAG estruturado, agrupa pelo próprio identificador.
  if (!code) {
    const rootTag = name ? `NOME:${name.toUpperCase()}` : "SEM-ID";
    return {
      rootTag,
      rootDescription: name || "EQUIPAMENTO NÃO INFORMADO",
      familyCode: "",
      familyLabel: "Não informado",
      dataQualityIssue: true
    };
  }

  // Enriquecimento pela planilha (quando importada): raiz autoritativa do TAG.
  const entry = lookup?.get(code);
  const rootFromTable = entry?.rootTag ? normalizeTechnicalObjectCode(entry.rootTag) : "";
  const rootTag = rootFromTable || resolveRootTag(code);
  const isComponent = rootTag !== code;

  const rootEntry = lookup?.get(rootTag);
  const familyCode =
    (rootEntry?.equipmentFamily || entry?.equipmentFamily || extractFamilyCode(rootTag) || "").toUpperCase();

  const rootDescription =
    cleanDescription(rootEntry?.rootDescription) ||
    cleanDescription(rootEntry?.description) ||
    cleanDescription(entry?.rootDescription) ||
    // OS registrada exatamente na raiz: usa o próprio nome do equipamento.
    (!isComponent && name ? name : "") ||
    synthesizeRootDescription(rootTag);

  const result: FunctionalLocationRoot = {
    rootTag,
    rootDescription,
    familyCode,
    familyLabel: familyCode ? getFamilyLabel(familyCode) : "Não informado",
    costCenter: cleanDescription(rootEntry?.costCenter) || cleanDescription(entry?.costCenter) || undefined,
    dataQualityIssue: false
  };

  if (isComponent) {
    result.componentTag = code;
    result.componentDescription = cleanDescription(entry?.description) || (name || code);
  }

  return result;
}

function cleanDescription(value: string | null | undefined): string {
  return (value ?? "").trim();
}

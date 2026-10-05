/**
 * PC-Factory → equipamento SAP: correspondência por FAMÍLIA + NÚMERO da máquina.
 *
 * Não existe chave comum entre as duas bases: o PC-Factory chama a máquina de
 * "Multifio 04 - BM" e o SAP de ZC-SR-G07-MF-0004 (MULTIFIO 04 BM). Esta
 * correspondência serve SÓ para PRIORIZAR a busca de OS na justificativa de baixa
 * disponibilidade — nunca para bloquear um vínculo nem para calcular nada. Quando
 * o nome não é reconhecível ("Politriz 22 - Simec" cabe em duas linhas, tanques e
 * fornos de secagem não têm raiz equivalente), devolve lista vazia e a tela busca
 * em todas as OS.
 *
 * Puro: sem Prisma e sem React.
 */

/** Palavra(s) do nome do PC-Factory → código de família do TAG SAP. */
const FAMILY_WORDS: Array<[RegExp, string]> = [
  [/^mult?i?fio\b/i, "MF"], // "Multifio", e o "Multfio" que vem com erro de digitação da origem
  [/^bifio\b/i, "BF"],
  [/^nano\s*fio\b/i, "NF"],
  [/^tear\s+convencional\b/i, "TC"],
  [/^tear\s+diamantado\b/i, "TD"],
  [/^fresa\s+ponte\b/i, "FP"]
];

/** Nome já em forma de código: "LR03-G08", "LV01-G03", "PZ04-G08". */
const CODE_NAME = /^(LR|LV|PZ)\s*-?\s*(\d{2})(?![0-9A-Z])/i;

/** Galpão escrito no nome ("G08", "G3") — desempata máquinas de mesmo número. */
const SHED = /\bG0?(\d{1,2})\b/i;

/** Família + número + (opcional) galpão extraídos do nome do PC-Factory. */
export function parsePcFactoryMachine(resourceName: string): { family: string; number: number; shed: number | null } | null {
  const name = resourceName.replace(/\s+/g, " ").trim();
  if (!name) return null;

  const shedMatch = name.match(SHED);
  const shed = shedMatch ? Number(shedMatch[1]) : null;

  const code = name.match(CODE_NAME);
  if (code) return { family: code[1].toUpperCase(), number: Number(code[2]), shed };

  for (const [pattern, family] of FAMILY_WORDS) {
    const match = name.match(pattern);
    if (!match) continue;
    const number = name.slice(match[0].length).match(/^\s*(\d{1,2})\b/);
    return number ? { family, number: Number(number[1]), shed } : null;
  }
  return null;
}

/**
 * TAGs SAP de máquina RAIZ que correspondem ao nome do PC-Factory, a partir dos TAGs
 * conhecidos (cadastro de locais de instalação). Ex.: "Multifio 04 - BM" →
 * ["ZC-SR-G07-MF-0004"]. Vazio quando não há correspondência segura.
 */
export function matchSapMachineTags(resourceName: string, knownTags: Iterable<string>): string[] {
  const parsed = parsePcFactoryMachine(resourceName);
  if (!parsed) return [];

  // Raiz = TAG que TERMINA em FAMÍLIA-NÚMERO de 4 dígitos (ex.: ...-MF-0004). O
  // número de 4 dígitos exclui carros/suportes como "...-CT-MF-04".
  const suffix = `-${parsed.family}-${String(parsed.number).padStart(4, "0")}`;
  const candidates = Array.from(new Set(Array.from(knownTags).filter((tag) => tag.toUpperCase().endsWith(suffix))));

  if (candidates.length > 1 && parsed.shed !== null) {
    const shedToken = `-G${String(parsed.shed).padStart(2, "0")}-`;
    const sameShed = candidates.filter((tag) => tag.toUpperCase().includes(shedToken));
    if (sameShed.length) return sameShed.sort();
  }
  return candidates.sort();
}

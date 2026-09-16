/**
 * RECURSOS LEGADOS BLOQUEADOS DO PC-FACTORY.
 *
 * Nomenclaturas antigas cujos dados a gestão conferiu manualmente e considerou
 * incorretos e inválidos para o portal. Os registros foram excluídos da base
 * (ver `scripts/remove-invalid-pcfactory-resources.ts`) e esta lista impede que
 * voltem na próxima importação: sem ela, o próximo arquivo do PC-Factory
 * recriaria exatamente o que foi removido.
 *
 * REGRA DE CASAMENTO — deliberadamente estrita.
 *
 * Só `trim` + caixa. Nada de `contains`, `startsWith`, similaridade ou distância
 * de edição: o cadastro tem pares como `PZ20K-G9` (antigo, na lista) e
 * `PZ20K-G4` (atual, em uso), e qualquer casamento aproximado apagaria máquina
 * válida. Um nome que não bate exatamente NÃO é bloqueado — é reportado como não
 * encontrado, para decisão humana.
 *
 * A única equivalência além de caixa é a grafia `Multfio` ⇄ `Multifio`, declarada
 * pela própria gestão ao definir o escopo ("MULTFIO3 / Multifio3 / multifio3 podem
 * ser considerados a mesma nomenclatura"). Ela é aplicada só quando o RESTO do
 * nome é idêntico, e por isso não alcança as máquinas atuais — `Multifio 03 - BM`
 * tem espaços e sufixo, então nunca colide com `multfio3`.
 */

/** As 41 nomenclaturas informadas pela gestão, exatamente como recebidas. */
export const PC_FACTORY_BLOCKED_LEGACY_RESOURCES: readonly string[] = [
  "BIFIO-01",
  "BIFIO-02",
  "BIFIO-03",
  "BIFIO-04",
  "Emvelopa",
  "Forno Secagem 02 G3",
  "Forno Secagem 03 G3",
  "higeia",
  "LR-S",
  "LRS-G9",
  "LRS-MAR",
  "LRSB-G3",
  "Multifio3",
  "Multifio4",
  "Multifio5",
  "Multifio6",
  "Multifio7",
  "Multifio8",
  "NanoFio 01",
  "PZ-13S",
  "PZ-18S",
  "PZ-19",
  "PZ-22S",
  "PZ-23S",
  "PZ18S-G9",
  "PZ20K-G9",
  "PZ20S-G9",
  "PZS-MAR",
  "Selecionamento 01",
  "Tanque02",
  "Tanque03 Z-Tech",
  "Tear03",
  "Tear04",
  "Tear05",
  "Tear06",
  "Tear07",
  "Tear08",
  "Tear09",
  "Tearmar2",
  "Tearmar3",
  "Tearmar4"
] as const;

/**
 * Forma canônica para comparação: sem espaços nas pontas, sem espaço duplicado
 * interno e em caixa baixa. NÃO remove hífens, pontos nem dígitos — são o que
 * distingue `PZ20K-G4` de `PZ20K-G9`.
 */
function canonical(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Variante única autorizada: a grafia `Multfio` (como está gravada na base) e
 * `Multifio` (como a gestão escreveu na lista) designam a mesma nomenclatura.
 * Aplicada sobre o nome JÁ canonizado, sem tocar no restante da string.
 */
function spellingVariants(canonicalName: string): string[] {
  const variants = new Set<string>([canonicalName]);
  if (canonicalName.includes("multifio")) variants.add(canonicalName.replace(/multifio/g, "multfio"));
  if (canonicalName.includes("multfio")) variants.add(canonicalName.replace(/multfio/g, "multifio"));
  return Array.from(variants);
}

/** Índice de busca, montado uma vez. */
const BLOCKED_INDEX: ReadonlySet<string> = new Set(
  PC_FACTORY_BLOCKED_LEGACY_RESOURCES.flatMap((name) => spellingVariants(canonical(name)))
);

/**
 * O nome do recurso é uma das nomenclaturas legadas bloqueadas?
 *
 * Usado na importação (para não gravar a linha) e na limpeza administrativa
 * (para localizar o que excluir). As duas precisam da MESMA regra, senão o
 * script apaga um conjunto e o importador bloqueia outro.
 */
export function isBlockedLegacyPcFactoryResource(resourceName: unknown): boolean {
  if (typeof resourceName !== "string") return false;
  const name = canonical(resourceName);
  return name.length > 0 && BLOCKED_INDEX.has(name);
}

/**
 * Nomenclatura solicitada que corresponde a um nome real da base, ou null.
 * Serve ao relatório: permite dizer QUAL item da lista casou com QUAL registro.
 */
export function matchBlockedLegacyResource(resourceName: string): string | null {
  const name = canonical(resourceName);
  for (const requested of PC_FACTORY_BLOCKED_LEGACY_RESOURCES) {
    if (spellingVariants(canonical(requested)).includes(name)) return requested;
  }
  return null;
}

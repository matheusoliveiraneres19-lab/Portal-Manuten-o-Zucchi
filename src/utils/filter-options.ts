/**
 * OPÇÕES DE FILTRO — regra única do portal.
 *
 * A reclamação da gestão foi literal: "filtros com equipamentos que não trazem
 * informação nenhuma". A causa era sempre a mesma em todas as abas — as opções eram
 * montadas com um `distinct` sobre a TABELA INTEIRA, enquanto a tela mostrava só o
 * recorte filtrado. No PC-Factory isso dava 83 máquinas no filtro para 40 com dados
 * em agosto/2026: 43 opções (52%) levavam a uma tela vazia.
 *
 * A regra passa a ser: **opção de filtro só existe se houver registro no recorte**.
 * Estes utilitários padronizam isso para que nenhuma aba invente a sua própria versão.
 */

/** Opção de filtro com a contagem do recorte atual (não da base inteira). */
export type FilterOption = {
  value: string;
  label: string;
  /** Quantos registros o recorte atual tem nessa opção. */
  count?: number;
};

/** Linha de um `groupBy` do Prisma: o campo agrupado + a contagem. */
type GroupedRow<Key extends string> = { [K in Key]: string | null } & { _count: number | { _all: number } };

function readCount(row: { _count: number | { _all: number } }): number {
  return typeof row._count === "number" ? row._count : row._count._all;
}

/**
 * Converte o resultado de um `groupBy` em opções de filtro, já sem os vazios e
 * ordenadas. Opções com contagem zero não existem — o `groupBy` só devolve o que tem
 * registro no recorte, que é exatamente a garantia que se quer aqui.
 *
 * @param label  rótulo de exibição; por padrão o próprio valor.
 */
export function optionsFromGroups<Key extends string>(
  rows: Array<GroupedRow<Key>>,
  key: Key,
  label?: (value: string, count: number) => string
): FilterOption[] {
  return rows
    .map((row) => ({ value: (row[key] ?? "") as string, count: readCount(row) }))
    .filter((item) => item.value.trim().length > 0 && item.count > 0)
    .map((item) => ({
      value: item.value,
      label: label ? label(item.value, item.count) : item.value,
      count: item.count
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

/** Mesma ideia, para listas de strings já contadas em memória. */
export function optionsFromCounts(counts: Map<string, number>, label?: (value: string, count: number) => string): FilterOption[] {
  return Array.from(counts.entries())
    .filter(([value, count]) => value.trim().length > 0 && count > 0)
    .map(([value, count]) => ({ value, label: label ? label(value, count) : value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

/** Conta ocorrências de um campo em memória, ignorando nulos/vazios. */
export function countBy<T>(rows: T[], pick: (row: T) => string | null | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = pick(row);
    if (!value || !value.trim()) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/**
 * Nomes dos filtros que ficaram sem NENHUMA opção no recorte — a página usa isto
 * para esconder o campo e declarar no painel de qualidade o que escondeu.
 *
 * Esconder é melhor que mostrar vazio: um seletor sem opções parece um carregamento
 * que falhou. Declarado no painel, vira informação.
 */
export function hiddenFilterLabels(filtros: Array<{ label: string; options: unknown[] }>): string[] {
  return filtros.filter((filtro) => filtro.options.length === 0).map((filtro) => filtro.label);
}

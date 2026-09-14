/**
 * QUALIDADE DOS DADOS — contrato compartilhado por todas as abas.
 *
 * A gestão não desconfia de um número errado; desconfia de um número sem origem.
 * Estes tipos existem para que cada página possa dizer, na própria tela, de onde o
 * indicador veio, quantos registros entraram na conta e o que ficou de fora — em vez
 * de mostrar "—" e deixar o usuário concluir que o portal está quebrado.
 *
 * Nada aqui é calculado no componente: os services preenchem, a UI só exibe.
 */

/** Tom do aviso. `danger` só para o que invalida o indicador. */
export type DataQualityTone = "info" | "warning" | "danger";

/**
 * Um aviso de qualidade. Sempre com próximo passo: o usuário precisa saber o que
 * fazer (reimportar com a coluna X, rodar a importação Y), não só que falta algo.
 */
export type DataQualityNotice = {
  id: string;
  /** O que está indisponível, em uma frase. */
  message: string;
  /** Consequência e próximo passo. */
  detail?: string;
  tone?: DataQualityTone;
};

/** Um número do painel (ex.: "Registros analisados: 12.480"). */
export type DataQualityMetric = {
  label: string;
  value: string;
  /** Explicação opcional em letra miúda. */
  hint?: string;
};

/**
 * Resumo de qualidade de uma página. Montado no service, a partir do MESMO recorte
 * que alimenta os cards — senão o painel mediria outra coisa que não a tela.
 */
export type DataQualitySummary = {
  /** Registros que entraram no recorte filtrado. */
  analyzedRecords: number;
  /** Registros efetivamente usados nos indicadores (após regras de exclusão). */
  validRecords: number;
  /** Registros descartados dos indicadores, com o motivo em `notices`. */
  ignoredRecords: number;
  /**
   * Campos que a base importada NÃO trouxe (rótulos de negócio, não nomes de coluna
   * do banco). Alimentam o FieldNotice e explicam indicadores ocultos.
   */
  missingFields: string[];
  /**
   * Filtros que a página escondeu por não terem nenhuma opção com dados no recorte.
   * Aparecer aqui é melhor que aparecer vazio na tela.
   */
  hiddenFilters: string[];
  /** Opções de filtro removidas por não terem dados no período (contagem). */
  removedFilterOptions: number;
  /** ISO da última importação do módulo, ou null quando não há histórico. */
  lastImportAt: string | null;
  /** Arquivo/origem da última importação, quando conhecido. */
  lastImportLabel: string | null;
  /** De onde os números vieram (ex.: "Banco de dados — importação PC-Factory"). */
  sourceLabel: string;
  /** Métricas específicas da página. */
  metrics: DataQualityMetric[];
  notices: DataQualityNotice[];
};

/** Resumo vazio — usado quando o banco falha, para a página não quebrar. */
export function emptyDataQualitySummary(sourceLabel: string): DataQualitySummary {
  return {
    analyzedRecords: 0,
    validRecords: 0,
    ignoredRecords: 0,
    missingFields: [],
    hiddenFilters: [],
    removedFilterOptions: 0,
    lastImportAt: null,
    lastImportLabel: null,
    sourceLabel,
    metrics: [],
    notices: []
  };
}

/**
 * Origem dos dados de uma página do portal.
 *
 * A distinção entre "empty" e "unavailable" é deliberada e importante para o
 * gestor: as duas resultam numa tela sem números, mas exigem AÇÕES OPOSTAS.
 *
 * - "database":    leitura real do PostgreSQL/Supabase.
 * - "empty":       a consulta funcionou e não há registros. A ação correta é
 *                  IMPORTAR a planilha do módulo.
 * - "unavailable": a consulta FALHOU (banco fora, timeout, pool esgotado). Os
 *                  dados existem; a ação correta é TENTAR NOVAMENTE. Mostrar
 *                  "importe a planilha" aqui manda o usuário reimportar dados que
 *                  já estão no banco — pior do que não dizer nada.
 *
 * Em nenhum dos casos o portal exibe números fictícios.
 */
export type PageDataSource = "database" | "empty" | "unavailable";

/** true quando a página não tem dados a exibir (sem registros OU falha). */
export function hasNoData(source: PageDataSource): boolean {
  return source !== "database";
}

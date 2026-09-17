/**
 * RELATÓRIO DE ADERÊNCIA À EXECUÇÃO DAS ORDENS DE SERVIÇO — contrato de dados.
 *
 * Tipos puros (sem Prisma, sem React): o mesmo dataset é produzido pelo service
 * (`service-order-adherence-report.service`), transportado pela rota
 * `/api/service-orders/adherence-report` e consumido pelo renderizador de PDF.
 *
 * REGRA CENTRAL — o renderizador NÃO recalcula regra de negócio. Tudo o que o PDF
 * imprime já vem pronto daqui: totais, percentuais, rótulos de período e rankings.
 * Isso é o que impede o relatório de divergir da tela (o erro que a aba já teve,
 * quando cards e tabela contavam recortes diferentes).
 *
 * ADERÊNCIA NULA vs. ZERO: `aderencia` é `number | null`. `null` significa "não há
 * OS no recorte" e é impresso como "—". Um mês/área sem nenhuma ordem NUNCA vira
 * 0%, porque 0% significaria "havia ordens e nenhuma foi encerrada" — conclusão
 * oposta à realidade. É também o que elimina NaN (0/0) do relatório.
 */

/** As três áreas do relatório, na ordem em que aparecem em todas as páginas. */
export type AdherenceAreaKey = "MECANICA" | "ELETRICA" | "TERCEIROS";

/** Ordem canônica das áreas — use sempre esta, nunca `Object.keys`. */
export const ADHERENCE_AREA_ORDER: AdherenceAreaKey[] = ["MECANICA", "ELETRICA", "TERCEIROS"];

/** Rótulo de exibição de cada área. */
export const ADHERENCE_AREA_LABEL: Record<AdherenceAreaKey, string> = {
  MECANICA: "Mecânica",
  ELETRICA: "Elétrica",
  TERCEIROS: "Terceiros"
};

/**
 * Bloco de contagem usado em todo o relatório.
 *
 * INVARIANTE: `fechadas + abertas === total`. "Fechada" é a OS com status
 * FECHADA — o destino do "Tecnicamente encerrado (3)" do SAP. "Aberta" é todo o
 * resto do recorte (aberta, liberada, em andamento, aguardando material,
 * cancelada), exatamente como o relatório de referência tratava.
 */
export type AdherenceTotals = {
  total: number;
  fechadas: number;
  abertas: number;
  /** Percentual 0..100 com 1 casa, ou `null` quando `total === 0`. */
  aderencia: number | null;
};

/** Totais de uma área, já rotulados. */
export type AdherenceAreaTotals = AdherenceTotals & {
  area: AdherenceAreaKey;
  label: string;
};

/** Uma linha da série mensal: o mês, o geral e cada área. */
export type AdherenceMonthRow = {
  /** Chave ordenável "YYYY-MM". */
  monthKey: string;
  /** "Janeiro", "Fevereiro"… (eixo X da página 3). */
  label: string;
  /** "jan/26" — para eixos apertados. */
  shortLabel: string;
  geral: AdherenceTotals;
  porArea: Record<AdherenceAreaKey, AdherenceTotals>;
};

/** Uma linha do ranking por colaborador. */
export type AdherenceCollaboratorRow = {
  responsavel: string;
  total: number;
  fechadas: number;
  pendentes: number;
  aderencia: number | null;
};

/** Ranking de uma área + o volume que ficou sem responsável preenchido. */
export type AdherenceAreaCollaborators = {
  area: AdherenceAreaKey;
  label: string;
  /** Ordenado: maior aderência primeiro; empate resolvido por maior volume. */
  rows: AdherenceCollaboratorRow[];
  /**
   * OS da área sem responsável preenchido. FICA FORA do ranking (não vira um
   * "colaborador" fictício) mas é publicado como número à parte — historicamente
   * é um volume relevante e escondê-lo distorceria a leitura do ranking.
   */
  semResponsavel: number;
  /** Totais da área (iguais aos de `porArea`), para conferência na própria página. */
  totals: AdherenceTotals;
};

/** Seção "Qualidade dos dados" — transparência sobre o que entrou e o que não entrou. */
export type AdherenceDataQuality = {
  /** OS consideradas sem responsável preenchido. */
  semResponsavel: number;
  /** OS do período sem grupo de planejamento (não classificáveis por área). */
  semGrupoPlanejamento: number;
  /** OS sem data-base de início — não entram em nenhum recorte por período. */
  semDataBase: number;
  /** OS efetivamente consideradas no relatório (as três áreas). */
  consideradas: number;
  /** OS do recorte fora das três áreas (Lubrificação, Usinagem, Automação…). */
  foraDasAreas: number;
  /** Linhas de operação lidas do banco para produzir as OS consideradas. */
  linhasOperacao: number;
};

/** Período do relatório, com os rótulos já prontos para impressão. */
export type AdherencePeriod = {
  /** "2026-01-01". */
  from: string;
  /** "2026-08-31". */
  to: string;
  /** "01/01/2026 a 31/08/2026". */
  label: string;
  /** "JANEIRO A AGOSTO DE 2026" — derivado do período, nunca fixo. */
  titleLabel: string;
};

/** Dataset completo do relatório. É tudo o que o renderizador de PDF recebe. */
export type AdherenceReportDataset = {
  /** ISO da geração, impresso no rodapé. */
  geradoEm: string;
  periodo: AdherencePeriod;
  /** Filtros da tela efetivamente aplicados, já descritos em texto para a capa. */
  filtros: {
    usouFiltrosDaTela: boolean;
    /** Ex.: ["Responsável: Ryann Zibel", "Objeto técnico: BRITADOR"]. */
    descricao: string[];
  };
  geral: AdherenceTotals;
  porArea: AdherenceAreaTotals[];
  porMes: AdherenceMonthRow[];
  colaboradores: AdherenceAreaCollaborators[];
  qualidade: AdherenceDataQuality;
  /** "aderencia-os-2026-01-a-2026-08.pdf". */
  fileName: string;
};

/**
 * Filtros da tela que o relatório aceita replicar. Espelha
 * `AppliedServiceOrderFilters`, menos os campos de paginação e de busca livre de
 * texto que não fazem sentido num relatório gerencial (`search`/`osNumber`).
 */
export type AdherenceReportFilters = {
  statuses?: string[];
  equipment?: string;
  areas?: string[];
  planningGroups?: string[];
  responsibles?: string[];
};

/** Corpo do POST /api/service-orders/adherence-report. */
export type AdherenceReportRequest = {
  /** "2026-01-01" */
  dateFrom: string;
  /** "2026-08-31" */
  dateTo: string;
  useCurrentFilters: boolean;
  filters?: AdherenceReportFilters;
};

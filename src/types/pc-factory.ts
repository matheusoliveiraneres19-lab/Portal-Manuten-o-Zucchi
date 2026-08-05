import type { PcFactoryStatusCategory } from "@prisma/client";
import type { PcFactoryManagementGroup } from "@/utils/pc-factory-normalizer";

export type { PcFactoryStatusCategory };
export type { PcFactoryManagementGroup };

/**
 * Linha da Tabela Gerencial (Management View do PC-Factory): um dos 6 grupos, com horas
 * de "Tempo Decorrido", % do total, e % / horas acumuladas (como na tela do PC-Factory).
 */
export type PcFactoryManagementGroupRow = {
  group: PcFactoryManagementGroup;
  label: string;
  color: string;
  totalHours: number;
  percent: number;
  cumulativeHours: number;
  cumulativePercent: number;
};

/* ------------------------------------------------------------------ */
/* Parâmetros de consulta/análise                                     */
/* ------------------------------------------------------------------ */

export type PcFactoryQueryParams = {
  /** Janela livre (yyyy-mm-dd) aplicada a startDateTime dos registros. */
  startDate?: string;
  endDate?: string;
  /** Filtros acumulativos (multi-seleção). */
  resources?: string[];
  productionLines?: string[];
  /** Grupo gerencial do portal (ex.: Indústria Granito, Indústria Mármore). */
  groupPortals?: string[];
  sectors?: string[];
  shifts?: string[];
  /** Valores exatos de "Nome Status Recurso". */
  statusNames?: string[];
  /** Classificações gerenciais. */
  categories?: PcFactoryStatusCategory[];
  /** Toggles de manutenção (booleanos). */
  onlyMaintenance?: boolean;
  onlyMechanical?: boolean;
  onlyElectrical?: boolean;
  onlyAutomation?: boolean;
  onlyWaiting?: boolean;
  /** Exclui Fora de Turno / Recurso Não Programado dos resultados. */
  excludeOutOfPlanned?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
};

/* ------------------------------------------------------------------ */
/* KPIs e indicadores                                                 */
/* ------------------------------------------------------------------ */

export type PcFactoryTopResource = {
  resourceName: string;
  resourceCode: string | null;
  hours: number;
} | null;

export type PcFactoryKpis = {
  totalRecords: number;
  totalResources: number;
  totalGroups: number;
  totalProductionLines: number;
  totalHours: number;
  /** Tempo planejado = total − (Fora de Turno + Recurso Não Programado). */
  plannedHours: number;
  productionHours: number;
  /** Horas dos 3 status de manutenção (Mecânica + Elétrica + Aguardando). */
  maintenanceHours: number;
  mechanicalMaintenanceHours: number;
  electricalMaintenanceHours: number;
  automationMaintenanceHours: number;
  waitingMaintenanceHours: number;
  setupHours: number;
  /** Perdas operacionais (não-manutenção): Falta de Material, Parada não Identificada e Setup (decisão da empresa). */
  lossHours: number;
  /** Tempo neutro planejado (Refeição + Outros). */
  operationalHours: number;
  /** Fora do tempo planejado (Fora de Turno + Recurso Não Programado). */
  excludedHours: number;
  /** Tempo de paradas para disponibilidade = manutenção + perdas operacionais. */
  stoppedHours: number;
  maintenanceEvents: number;
  mechanicalEvents: number;
  electricalEvents: number;
  automationEvents: number;
  waitingEvents: number;
  /** MTTR gerencial (horas) = horas de manutenção / eventos. null = dados insuficientes. */
  mttr: number | null;
  /** MTBF gerencial (horas) = (planejado real − manutenção real) / eventos. null = dados insuficientes. */
  mtbf: number | null;
  /** MTTA gerencial estimado (horas) = horas Aguardando Manutenção / eventos de aguardando. null = dados insuficientes. */
  mtta: number | null;
  /** % manutenção sobre o tempo planejado. null = dados insuficientes. */
  maintenancePercentOfPlanned: number | null;
  /**
   * Disponibilidade (%) — regra da planilha oficial G0134:
   * (Tempo Operacional − Manutenção) / Tempo Operacional × 100, onde Tempo Operacional =
   * Tempo de Carga − Paradas Planejadas (= G0134.LOADTIME) e Manutenção inclui Aguardando
   * Manutenção. Ponderado pelos totais do recorte, nunca média simples de máquinas.
   * NÃO é Utilização nem o DTM [%] nativo. null = sem Tempo Operacional.
   */
  availabilityPercent: number | null;
  topMaintenanceResource: PcFactoryTopResource;
};

export type PcFactoryCategorySlice = {
  category: PcFactoryStatusCategory;
  label: string;
  color: string;
  totalHours: number;
  percent: number;
};

/**
 * Fatia da "Distribuição de horas por classificação" agrupada pelo STATUS REAL da
 * planilha (statusRaw). A cor (`colorHex`) segue a planilha quando disponível
 * (statusColorHex), com fallback por statusKey; `colorSource` permite auditar a origem.
 */
export type PcFactoryStatusSlice = {
  statusRaw: string;
  statusKey: string;
  hours: number;
  percent: number;
  colorHex: string;
  colorSource: "planilha" | "fallback" | "neutro";
};

export type PcFactoryMaintenanceSplit = {
  key: "MECANICA" | "ELETRICA" | "AUTOMACAO" | "PLANEJADA" | "TERCEIROS" | "AGUARDANDO";
  label: string;
  hours: number;
  events: number;
  color: string;
};

export type PcFactoryResourceRow = {
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  groupPortal: string | null;
  plannedHours: number;
  productionHours: number;
  maintenanceHours: number;
  mechanicalHours: number;
  electricalHours: number;
  automationHours: number;
  planejadaHours: number;
  terceirosHours: number;
  waitingHours: number;
  lossHours: number;
  stoppedHours: number;
  maintenanceEvents: number;
  waitingEvents: number;
  mttr: number | null;
  mtbf: number | null;
  mtta: number | null;
  availabilityPercent: number | null;
};

/**
 * Confiabilidade por máquina (dashboard "Confiabilidade por Máquina"). Segue as regras
 * OFICIAIS do PC-Factory: base = durationHours (Tempo Decorrido); reparo = Mecânica +
 * Elétrica + Automação + Terceiros (NÃO inclui Aguardando nem Planejada); Aguardando entra
 * só no MTTA e nas Paradas. Tudo calculado no service central. null = não aplicável → UI "—".
 */
export type PcFactoryReliabilityRow = {
  machineName: string;
  machineCode: string | null;
  productionLine: string | null;
  groupPortal: string | null;

  /** Tempo planejado (Tempo Decorrido) excluindo Fora de Turno e Recurso Não Programado. */
  plannedHours: number;
  /** plannedHours − paradas de manutenção (≥ 0). */
  operatingHours: number;

  /** Quebras = eventos de manutenção (Mec+Elét+Autom+Terceiros+Aguardando). Exclui Planejada. */
  failureEvents: number;

  /** Soma de durationHours de Mecânica+Elétrica+Automação+Terceiros (sem Aguardando). */
  repairHours: number;
  /** Soma de durationHours de "Aguardando Manutenção". */
  waitingMaintenanceHours: number;
  /** Paradas de manutenção = repairHours + waitingMaintenanceHours. */
  maintenanceDowntimeHours: number;

  /** (operatingHours / failureEvents). null = sem tempo planejado ou sem quebras. */
  mtbf: number | null;
  /** (repairHours / failureEvents). null = sem reparo ou sem quebras. */
  mttr: number | null;
  /** (waitingMaintenanceHours / failureEvents). null = sem Aguardando Manutenção. */
  mtta: number | null;

  /** Alias de maintenanceDowntimeHours (coluna "Paradas"). */
  downtimeHours: number;
  /**
   * Disponibilidade da máquina (%) — MESMA fórmula do card principal (planilha G0134):
   * ((Tempo Operacional − paradas de manutenção) / Tempo Operacional) × 100, onde
   * Tempo Operacional = plannedHours − paradas planejadas. null = sem Tempo Operacional.
   */
  availability: number | null;

  /** Aviso de qualidade de dados (ex.: paradas > planejado, sem tempo planejado). */
  dataQualityIssue: string | null;
};

/** Fatia do Pareto de causas raiz de manutenção (ordenado por horas, com % acumulado). */
export type PcFactoryRootCauseSlice = {
  cause: string;
  hours: number;
  events: number;
  percent: number;
  cumulativePercent: number;
};

/** Agregação de manutenção por Grupo Portal (ex.: Indústria Granito). */
export type PcFactoryGroupRow = {
  groupPortal: string;
  resourcesCount: number;
  plannedHours: number;
  maintenanceHours: number;
  mechanicalHours: number;
  electricalHours: number;
  automationHours: number;
  waitingHours: number;
  lossHours: number;
  stoppedHours: number;
  maintenanceEvents: number;
  waitingEvents: number;
  mttr: number | null;
  mtbf: number | null;
  mtta: number | null;
  availabilityPercent: number | null;
};

export type PcFactoryProductionLineRow = {
  productionLine: string;
  resourcesCount: number;
  plannedHours: number;
  productionHours: number;
  maintenanceHours: number;
  lossHours: number;
  stoppedHours: number;
  availabilityPercent: number | null;
};

export type PcFactoryTrendPoint = {
  period: string;
  label: string;
  maintenanceHours: number;
  mechanicalHours: number;
  electricalHours: number;
  automationHours: number;
  waitingHours: number;
  plannedHours: number;
  availabilityPercent: number | null;
};

export type PcFactoryRecordRow = {
  id: string;
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  groupPortal: string | null;
  sector: string | null;
  statusRaw: string | null;
  statusCategory: PcFactoryStatusCategory;
  classificationLabel: string;
  maintenanceType: string | null;
  isMaintenance: boolean;
  isMaintenanceKpi: boolean;
  isInPlannedTime: boolean;
  startDateTime: string | null;
  endDateTime: string | null;
  durationHours: number;
  shift: string | null;
  orderNumber: string | null;
  productDescription: string | null;
  observation: string | null;
};

export type PcFactoryRecordsResult = {
  data: PcFactoryRecordRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PcFactoryFilterOptions = {
  resources: Array<{ value: string; label: string }>;
  productionLines: Array<{ value: string; label: string }>;
  groupPortals: Array<{ value: string; label: string }>;
  sectors: Array<{ value: string; label: string }>;
  shifts: Array<{ value: string; label: string }>;
  /** Valores exatos de "Nome Status Recurso" presentes nos dados. */
  statusNames: Array<{ value: string; label: string }>;
  categories: Array<{ value: PcFactoryStatusCategory; label: string }>;
};

export type PcFactoryReferencePeriod = {
  startDate: string;
  endDate: string;
  label: string;
};

export type PcFactoryRecommendation = {
  tone: "danger" | "warning" | "info";
  message: string;
};

export type PcFactoryResourceDetails = {
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  sector: string | null;
  groupPortal: string | null;
  plannedHours: number;
  maintenanceHours: number;
  mechanicalHours: number;
  electricalHours: number;
  automationHours: number;
  waitingHours: number;
  stoppedHours: number;
  maintenanceEvents: number;
  waitingEvents: number;
  mttr: number | null;
  mtbf: number | null;
  mtta: number | null;
  availabilityPercent: number | null;
  categoryDistribution: PcFactoryCategorySlice[];
  maintenanceTimeline: PcFactoryRecordRow[];
  recentRecords: PcFactoryRecordRow[];
  recommendations: PcFactoryRecommendation[];
};

/* ------------------------------------------------------------------ */
/* Orquestrador da página                                             */
/* ------------------------------------------------------------------ */

export type PcFactoryPageData = {
  reference: PcFactoryReferencePeriod;
  kpis: PcFactoryKpis;
  categoryDistribution: PcFactoryCategorySlice[];
  /** Distribuição de horas pelos STATUS REAIS da planilha, com cor (planilha/fallback). */
  statusDistribution: PcFactoryStatusSlice[];
  /** Tabela Gerencial — 6 grupos do PC-Factory por "Tempo Decorrido" (base oficial). */
  managementTable: PcFactoryManagementGroupRow[];
  maintenanceSplit: PcFactoryMaintenanceSplit[];
  criticalResources: PcFactoryResourceRow[];
  /** Confiabilidade por máquina (regras oficiais: MTBF/MTTR/MTTA/disponibilidade). */
  reliabilityByMachine: PcFactoryReliabilityRow[];
  topMechanical: PcFactoryResourceRow[];
  topElectrical: PcFactoryResourceRow[];
  topAutomation: PcFactoryResourceRow[];
  topWaiting: PcFactoryResourceRow[];
  productionLines: PcFactoryProductionLineRow[];
  groupSummary: PcFactoryGroupRow[];
  trend: PcFactoryTrendPoint[];
  /** Pareto das causas raiz de manutenção (80/20). */
  rootCausePareto: PcFactoryRootCauseSlice[];
  records: PcFactoryRecordsResult;
  filterOptions: PcFactoryFilterOptions;
  /** Diagnóstico de qualidade da importação refletido nos dados atuais. */
  dataQuality: PcFactoryDataQuality;
  source: "database" | "empty";
};

/** Painel "Qualidade da importação" (TAREFA 8). */
export type PcFactoryDataQuality = {
  totalRecords: number;
  periodStart: string | null;
  periodEnd: string | null;
  groupsDetected: string[];
  resourcesDetected: number;
  statusDetected: string[];
  recordsWithIssue: number;
  /**
   * Horas no bucket NAO_APONTADO ("Aguardando lançamento" + "Parada não Identificada")
   * no recorte atual. Está DENTRO do Tempo de Carga e, como não é manutenção, conta como
   * tempo disponível na regra G0134 — ou seja, INFLA a Disponibilidade. Precisa ficar
   * visível: quando é alto, o indicador reflete menos a máquina e mais a falta de
   * apontamento.
   */
  notReportedHours: number;
  /**
   * Registros com endDateTime nulo — status ABERTOS na origem (o PC-Factory nunca
   * registrou a mudança seguinte). EXCLUÍDOS de todas as somas de horas: a duração deles
   * é a distância até o momento do export, não uma medição. Seguem visíveis na tabela.
   */
  recordsWithoutEndDate: number;
  /** Horas que esses status abertos declaravam e que ficaram FORA dos indicadores. */
  excludedOpenEndedHours: number;
  /** Auditoria da fórmula de Disponibilidade — para conferir contra a planilha G0134. */
  availabilityAudit: PcFactoryAvailabilityAudit;
};

/**
 * Auditoria da Disponibilidade oficial (TAREFA 11): os números exatos que entram na
 * fórmula, para comparação linha a linha com a planilha
 * `disponibilidade mensal exportado.xlsx`:
 *
 *   operationalHours        ↔ G0134.LOADTIME
 *   maintenanceHours        ↔ Tempo de Manutenção + Tempo Ag. Manutenção
 *   waitingMaintenanceHours ↔ Tempo Ag. Manutenção (isolado)
 *   availabilityPercent     ↔ coluna Disponibilidade
 */
export type PcFactoryAvailabilityAudit = {
  /** = G0134.LOADTIME. Tempo de Carga − Paradas Planejadas. */
  operationalHours: number;
  /** Numerador subtraído: manutenção DENTRO do Tempo Operacional (inclui Aguardando). */
  maintenanceHours: number;
  /** Parcela de "Aguardando Manutenção" — o que o DTM [%] nativo NÃO desconta. */
  waitingMaintenanceHours: number;
  /** Resultado da fórmula, ou null quando não há Tempo Operacional. */
  availabilityPercent: number | null;
  /** A fórmula, em texto, para não haver dúvida sobre qual regra gerou o número. */
  formula: string;
  /**
   * UTILIZAÇÃO (Trabalhado ÷ Operacional) — a fórmula ANTIGA, mantida só para
   * comparação. NÃO é a Disponibilidade.
   */
  utilizationPercent: number | null;
};

/** Resumo enxuto para futura integração com o dashboard principal (TAREFA 12). */
export type PcFactoryDashboardSummary = {
  hasData: boolean;
  maintenanceHours: number;
  availabilityPercent: number | null;
  mttr: number | null;
  topMaintenanceResources: Array<{ resourceName: string; hours: number }>;
  waitingMaintenanceResources: Array<{ resourceName: string; hours: number }>;
};

/* ------------------------------------------------------------------ */
/* Importação                                                         */
/* ------------------------------------------------------------------ */

export type PcFactoryImportError = {
  linha: number;
  campo?: string;
  valor?: unknown;
  mensagem: string;
};

/**
 * Layout de planilha detectado na leitura (auditoria da importação):
 *  - PC_FACTORY_IMPORT: aba ajustada `Import_PC_FACTORY` (camelCase em inglês).
 *  - PC_FACTORY_AG_GRID: export transacional ag-grid (Início/Término; "Tempo Decorrido [hr]"
 *    como FRAÇÃO DE DIA → ×24).
 *  - PC_FACTORY_AG_GRID_DAILY_SUMMARY: pivô agregado Recurso × Status (coluna "Ocorrência",
 *    sem Início/Término; "Tempo Decorrido[hr]" já em HORAS DECIMAIS → usado direto, sem ×24).
 *  - PC_FACTORY_STATUS_HISTORY_CSV: histórico de status já normalizado, exportado como CSV
 *    (separador ";", UTF-8 BOM, cabeçalhos camelCase, datas dd/mm/yyyy HH:mm:ss e horas
 *    decimais com ponto). "durationHours" é a base oficial de tempo; "realDurationHours"
 *    é só auditoria. Ver parsePcFactoryCsv.
 *  - UNKNOWN: layout não reconhecido.
 */
export type PcFactoryLayoutType =
  | "PC_FACTORY_STATUS_HISTORY_CSV"
  | "PC_FACTORY_IMPORT"
  | "PC_FACTORY_AG_GRID"
  | "PC_FACTORY_AG_GRID_DAILY_SUMMARY"
  | "UNKNOWN";

/** Motivos pelos quais uma linha foi ignorada (auditoria — TAREFA 9). */
export type PcFactoryIgnoredReasons = {
  noResource: number;
  noStatus: number;
  noDuration: number;
  emptyRow: number;
  duplicate: number;
  other: number;
};

/** Cor detectada para um status na importação (TAREFA 7 — auditoria da origem). */
export type PcFactoryStatusColorInfo = {
  statusRaw: string;
  statusKey: string;
  colorHex: string;
  source: "excel-column" | "excel-cell-fill" | "fallback" | "neutro";
};

export type PcFactoryImportResult = {
  totalRows: number;
  importedRows: number;
  createdRows: number;
  updatedRows: number;
  /** Registros apagados quando a importação foi em modo "substituir tudo" (replaceAll). */
  replacedRows: number;
  ignoredRows: number;
  ignoredReasons: PcFactoryIgnoredReasons;
  errorRows: number;
  /** Horas somadas dos registros importados (auditoria). */
  totalHours: number;
  maintenanceHours: number;
  /** Contagens por classificação (auditoria da regra de manutenção). */
  maintenanceRows: number;
  mechanicalMaintenanceRows: number;
  electricalMaintenanceRows: number;
  automationMaintenanceRows: number;
  waitingMaintenanceRows: number;
  excludedFromPlannedTimeRows: number;
  productionRows: number;
  setupRows: number;
  operationalLossRows: number;
  otherRows: number;
  dataQualityRows: number;
  /** Linhas sem "Tempo Decorrido Real" (caíram no fallback de durationHours). */
  missingRealDurationRows: number;
  /** Aba efetivamente lida (Import_PC_FACTORY, ag-grid, etc.). */
  sheetUsed: string | null;
  /** Layout detectado na leitura (TAREFA 7). */
  layoutType: PcFactoryLayoutType;
  /**
   * Soma da coluna "Ocorrência" (nº de eventos agregados) no layout de resumo diário.
   * Auditoria da importação (TAREFA 6/8) — NÃO é persistida por linha (sem coluna no banco).
   */
  totalOccurrences: number;
  periodDetected: { start: string | null; end: string | null };
  resourcesDetected: number;
  groupsDetected: string[];
  statusDetected: string[];
  /** Cores por status (TAREFA 7): total de status, quantos vieram da planilha vs fallback. */
  statusColorsTotal: number;
  statusColorsFromSheet: number;
  statusColorsFallback: number;
  statusColors: PcFactoryStatusColorInfo[];
  errors: PcFactoryImportError[];

  /* ---- Diagnóstico do arquivo lido (TAREFAS 13 e 14) ---- */
  /** Nome do arquivo, quando informado pelo chamador. */
  fileName: string | null;
  /** Como o arquivo foi lido: planilha Excel ou CSV. */
  readAs: "xlsx" | "csv";
  /** Separador usado no CSV (null para XLSX). */
  delimiterUsed: ";" | "," | null;
  /** true quando o CSV veio em UTF-8 BOM e o BOM foi removido do 1º cabeçalho. */
  bomRemoved: boolean;
  /** Cabeçalhos CRUS encontrados no arquivo, na ordem — para diagnóstico de layout. */
  columnsFound: string[];
  /** Cabeçalhos obrigatórios que NÃO foram encontrados (vazio = layout completo). */
  missingRequiredColumns: string[];
  /** Cabeçalhos recomendados ausentes (não bloqueiam a importação). */
  missingRecommendedColumns: string[];
  /** Linhas cujo endDateTime era inválido/sentinela (01/01/0001) e virou null. */
  invalidEndDatesCount: number;
  /** Linhas cujo durationHours estava vazio/inválido e entrou como 0. */
  invalidDurationCount: number;
  /**
   * Horas em buckets FORA do Tempo de Carga — tempo que não é medido como parada:
   * "Aguardando lançamento" (apontamento aberto) e "Parada não Identificada" (sem causa
   * apontada). Alerta de qualidade.
   */
  notReportedHours: number;
  /** Valores distintos de classificationPcFactoryRef vistos no arquivo. */
  classificationRefsDetected: string[];
};

/**
 * Linha bruta da planilha PC-Factory após mapeamento flexível de colunas.
 * Cobre tanto a aba ajustada `Import_PC_FACTORY` (camelCase) quanto a aba bruta `ag-grid`.
 */
export type PcFactoryExcelRow = {
  resourceCode?: unknown;
  resourceName?: unknown;
  productionLine?: unknown;
  groupPortal?: unknown;
  sector?: unknown;
  statusCode?: unknown;
  status?: unknown;
  statusDetails?: unknown;
  /**
   * "classificationPcFactoryRef" — classificação de referência da própria planilha
   * (Produção · Parada Planejada I · Parada Planejada II · Parada Não Planejada ·
   * Tempo Fora de Turno). Entra como ÚLTIMA prioridade em classifyAvailabilityBucket.
   */
  classificationRef?: unknown;
  /** "Ocorrência" — nº de eventos agregados na linha (layout de resumo diário). */
  occurrence?: unknown;
  /** "(R)Data de Produção" — data do dia agregado (layout de resumo diário). */
  productionDate?: unknown;
  /** Cor explícita do status, se a planilha trouxer coluna de cor (Cor/Color/Status Color…). */
  statusColor?: unknown;
  /** Colunas pré-calculadas da aba ajustada (usadas como fallback p/ status desconhecido). */
  statusCategory?: unknown;
  maintenanceType?: unknown;
  isMaintenanceKpi?: unknown;
  excludePlannedTime?: unknown;
  includePlannedTime?: unknown;
  isDowntimeForAvailability?: unknown;
  technicalKey?: unknown;
  importBatch?: unknown;
  dataQualityIssue?: unknown;
  /** Início/Término — podem vir como data+hora num único campo ou separados. */
  startDate?: unknown;
  endDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  /** Duração genérica (minutos / hh:mm / "1,5h"). */
  duration?: unknown;
  /** Duração explícita em minutos (coluna durationMinutes). */
  durationMinutes?: unknown;
  /** Duração explícita em horas (coluna durationHours / "Tempo Decorrido"). */
  durationHours?: unknown;
  /** "Tempo Decorrido Real" explícito em horas/minutos (aba ajustada), quando houver. */
  realDurationHours?: unknown;
  realDurationMinutes?: unknown;
  /** "Tempo Decorrido [hr]" da aba bruta — fração de dia (multiplicar por 24). */
  elapsedDayFraction?: unknown;
  /** "Tempo Decorrido Real[hr]" da aba bruta — fração de dia (base principal dos KPIs). */
  elapsedRealDayFraction?: unknown;
  orderNumber?: unknown;
  operationCode?: unknown;
  operationName?: unknown;
  productCode?: unknown;
  productDescription?: unknown;
  operatorName?: unknown;
  initialResponsible?: unknown;
  finalResponsible?: unknown;
  shift?: unknown;
  observation?: unknown;
  rootCause?: unknown;
};

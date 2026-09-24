import type { DataQualitySummary } from "@/types/data-quality";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";
import type {
  OrderClassFilter,
  PlanningActivityTypeKey,
  PlanningGroupKey
} from "@/utils/service-order-planning";

export type CriticalityLabel = "Normal" | "Monitorado" | "Atenção" | "Crítico";

/** Direção da tendência de OS nos últimos meses do período. */
export type TrendDirection = "up" | "down" | "stable";

/** Filtros acumulativos da análise (lidos da URL). */
export type CriticalEquipmentFilters = {
  startDate: string;
  endDate: string;
  statuses: ServiceOrderStatusLabel[];
  responsibleNames: string[];
  planningGroups: string[];
  /** Grupos de planejamento NORMALIZADOS (MEC, ELE, SERVICO_TERCEIRO, ...). */
  planningGroupKeys: PlanningGroupKey[];
  /** Tipos de atividade normalizados (CORRETIVA, PREVENTIVA, ...). */
  activityTypes: PlanningActivityTypeKey[];
  /** Corretivas / Planejadas / Todas (TAREFA 12). */
  orderClass: OrderClassFilter;
  areas: string[];
  /** Famílias de equipamento (código, ex.: MF, PZ). */
  families: string[];
  /** Centros de custo (código ou descrição). */
  costCenters: string[];
  /** Setores/galpões (2º-3º segmento do TAG, ex.: SR, IG-G03). */
  sectors: string[];
  onlyOpenOrders: boolean;
  onlyWithWorkedHours: boolean;
  /** Somente equipamentos reincidentes (OS repetidas acima da regra). */
  onlyRecurrent: boolean;
  /** Somente equipamentos com score crítico (>= limiar). */
  onlyCritical: boolean;
  limit: number;
};

export type CriticalEquipmentItem = {
  /** Chave estável de agrupamento = TAG da raiz (ou derivada do nome). */
  id: string;
  position: number;
  equipmentName: string;
  /** Código técnico / local de instalação RAIZ (ex.: ZC-SR-G07-MF-0004). */
  equipmentCode: string;
  /** TAG da raiz (igual a equipmentCode quando estruturado). */
  rootTag: string;
  /** Código da família (ex.: MF). */
  familyCode: string;
  /** Rótulo da família (ex.: Multifio). */
  familyLabel: string;
  /** Centro de custo (quando enriquecido pela planilha de locais). */
  costCenter: string;
  /** Setor/galpão derivado do TAG (ex.: SR-G07). */
  sector: string;
  /** Prefixo/família da máquina (compatibilidade). */
  machinePrefix: string;
  /** true quando a máquina não tem local de instalação estruturado. */
  dataQualityIssue: boolean;
  totalOrders: number;
  openOrders: number;
  releasedOrders: number;
  inProgressOrders: number;
  waitingMaterialOrders: number;
  closedOrders: number;
  canceledOrders: number;
  /** Ordens em aberto (não fechadas e não canceladas). */
  backlogOrders: number;
  totalWorkedHours: number;
  /** Média de horas apontadas por OS. */
  averageHoursPerOrder: number;
  /** Nº de componentes/ramificações distintos com OS neste ativo raiz. */
  componentCount: number;
  /** true quando o ativo é reincidente (OS repetidas acima da regra). */
  isRecurrent: boolean;
  /** Direção da tendência de OS nos últimos meses. */
  trendDirection: TrendDirection;
  /** Variação da tendência (últimos meses vs. anteriores), em pontos %. */
  trendDelta: number;
  lastOrderDate: string | null;
  mainResponsible: string;
  mainPlanningGroup: string;
  /** Grupo de planejamento normalizado MAIS RECORRENTE no ativo. */
  topPlanningGroup: PlanningGroupKey;
  topPlanningGroupLabel: string;
  /** Tipo de atividade MAIS RECORRENTE no ativo. */
  topActivityType: PlanningActivityTypeKey;
  topActivityTypeLabel: string;
  /** OS classificadas como corretivas neste ativo. */
  correctiveOrders: number;
  /** OS planejadas (preventiva + melhoria + inspeção + lubrificação + preditiva + planejada). */
  plannedOrders: number;
  criticalityScore: number;
  criticalityLabel: CriticalityLabel;
};

/** Fatia do dashboard "Ordens por Grupo de Planejamento" (TAREFA 3). */
export type CriticalEquipmentPlanningGroupSlice = {
  group: PlanningGroupKey;
  label: string;
  color: string;
  totalOrders: number;
  openOrders: number;
  closedOrders: number;
  correctiveOrders: number;
  plannedOrders: number;
};

/** Fatia do dashboard "Ordens por Tipo de Atividade" (TAREFA 5). */
export type CriticalEquipmentActivitySlice = {
  activity: PlanningActivityTypeKey;
  label: string;
  color: string;
  totalOrders: number;
  openOrders: number;
  closedOrders: number;
};

/** Dados do dashboard "Ordens Corretivas x Planejadas" (TAREFA 6). */
export type CriticalEquipmentCorrectivePlannedData = {
  totalOrders: number;
  correctiveOrders: number;
  plannedOrders: number;
  /** OS cujo tipo de atividade veio preenchido mas não reconhecido. */
  unclassifiedOrders: number;
  correctivePercent: number;
  plannedPercent: number;
};

/**
 * Disponibilidade dos campos do SAP na base importada (TAREFA 15). Quando falso,
 * a aba mostra o aviso de reimportação em vez de um gráfico zerado sem explicação.
 */
export type CriticalEquipmentFieldAvailability = {
  /** `planningGroup`/`planningGroupCode` preenchidos em ao menos uma OS do período. */
  planningGroup: boolean;
  /** `planningActivityType` preenchido em ao menos uma OS do período. */
  planningActivityType: boolean;
  /**
   * Cadastro de LOCAIS FUNCIONAIS importado (tabela `FunctionalLocation`).
   *
   * Família, Setor e Centro de Custo saem exclusivamente dele. Sem esse cadastro as
   * três colunas ficam vazias e os três filtros ficam sem opção — e a causa não é o
   * período nem a planilha de ordens, é uma importação que nunca foi rodada. Sem esta
   * flag a tela não teria como dizer isso.
   */
  functionalLocations: boolean;
};

export type CriticalEquipmentSummary = {
  totalEquipmentsAnalyzed: number;
  totalOrdersInPeriod: number;
  equipmentWithMostOrders: string;
  highestOrderCount: number;
  /** Equipamento com maior score crítico (líder de criticidade). */
  mostCriticalEquipment: string;
  /** Maior score crítico do período. */
  highestCriticalityScore: number;
  totalWorkedHours: number;
  averageOrdersPerEquipment: number;
  totalOpenOrders: number;
  /** OS abertas dentro dos equipamentos críticos (score >= limiar). */
  openOrdersOnCriticalEquipments: number;
  totalCriticalEquipments: number;
  /** Equipamentos em reincidência (OS repetidas acima da regra). */
  totalRecurrentEquipments: number;
  /** Nº de ordens sem local de instalação estruturado (agrupadas só por nome). */
  ordersWithoutTechnicalCode: number;
  /** Nº de OS preventivas programadas (PL/PV) ignoradas nesta análise. */
  ignoredPreventiveOrders: number;
  /** Nº de OS de "Equipamento não informado" (teste) ignoradas. */
  ignoredInvalidEquipment: number;
  /** Total bruto de OS no período (antes das exclusões). */
  rawOrdersInPeriod: number;
  /** Total de OS corretivas no período filtrado. */
  totalCorrectiveOrders: number;
  /** Total de OS planejadas no período filtrado. */
  totalPlannedOrders: number;
  /** Grupo de planejamento mais acionado no período. */
  topPlanningGroupLabel: string;
  topPlanningGroupOrders: number;
  /** Tipo de atividade mais recorrente no período. */
  topActivityTypeLabel: string;
  topActivityTypeOrders: number;
};

export type CriticalEquipmentTrendPoint = {
  /** Chave do período (YYYY-MM). */
  period: string;
  /** Rótulo amigável (MM/AAAA). */
  label: string;
  totalOrders: number;
};

export type CriticalEquipmentStatusSlice = {
  status: ServiceOrderStatusLabel;
  label: string;
  value: number;
  color: string;
};

export type CriticalEquipmentHoursPoint = {
  id: string;
  equipmentName: string;
  equipmentCode: string;
  totalWorkedHours: number;
};

/* O dashboard "Distribuição por família de equipamento" foi removido (TAREFA 9).
   A regra de família CONTINUA viva em `familyCode`/`familyLabel` dos itens e no
   filtro "Família" — ela segue sendo usada para agrupamento técnico. */

/** Componente/ramificação de um equipamento raiz (drill-down). */
export type CriticalEquipmentComponent = {
  tag: string;
  description: string;
  familyLabel: string;
  totalOrders: number;
  openOrders: number;
  totalWorkedHours: number;
};

/** Ordem de manutenção com todos os campos exibíveis no detalhe. */
export type CriticalEquipmentServiceOrder = {
  id: string;
  osNumber: string;
  title: string;
  description: string | null;
  status: ServiceOrderStatusLabel;
  openedAt: string | null;
  closedAt: string | null;
  workedHours: number | null;
  responsibleName: string | null;
  planningGroup: string | null;
  /** Rótulo do grupo de planejamento normalizado (ex.: "Mecânica"). */
  planningGroupLabel: string;
  /** Rótulo do tipo de atividade resolvido (ex.: "Corretiva"). */
  activityTypeLabel: string;
  operation: string | null;
  equipmentName: string | null;
  equipmentCode: string | null;
  technicalObjectRaw: string | null;
  failureCause: string | null;
  solution: string | null;
  source: string | null;
  importBatch: string | null;
};

export type CriticalEquipmentResponsibleStat = {
  name: string;
  count: number;
  hours: number;
};

export type CriticalEquipmentDetails = {
  item: CriticalEquipmentItem;
  statusDistribution: CriticalEquipmentStatusSlice[];
  frequentResponsibles: CriticalEquipmentResponsibleStat[];
  planningGroupBreakdown: Array<{ name: string; count: number }>;
  /** Drill-down: ordens por grupo de planejamento normalizado (TAREFA 13). */
  planningGroupDistribution: CriticalEquipmentPlanningGroupSlice[];
  /** Drill-down: ordens por tipo de atividade (TAREFA 13). */
  activityDistribution: CriticalEquipmentActivitySlice[];
  /** Drill-down: corretivas x planejadas do equipamento (TAREFA 13). */
  correctivePlanned: CriticalEquipmentCorrectivePlannedData;
  /** Ramificações/componentes com mais OS dentro do ativo raiz. */
  componentBreakdown: CriticalEquipmentComponent[];
  /** Evolução mensal das OS deste equipamento. */
  trend: CriticalEquipmentTrendPoint[];
  /** Todas as ordens vinculadas ao equipamento no período. */
  serviceOrders: CriticalEquipmentServiceOrder[];
};

export type EquipmentHoursResponsible = {
  name: string;
  totalHours: number;
  totalOrders: number;
  participationPercent: number;
};

export type EquipmentHoursByResponsible = {
  equipmentName: string;
  equipmentCode: string;
  totalWorkedHours: number;
  responsibles: EquipmentHoursResponsible[];
};

/** Opções para os multiselects de filtro. */
export type CriticalEquipmentFilterOptions = {
  statuses: ServiceOrderStatusLabel[];
  areas: string[];
  planningGroups: string[];
  responsibles: string[];
  /** Famílias disponíveis ({code,label}). */
  families: Array<{ value: string; label: string }>;
  /** Centros de custo disponíveis. */
  costCenters: string[];
  /** Setores/galpões disponíveis. */
  sectors: string[];
};

/**
 * Dados da página. Os campos de `CriticalEquipmentScopedData` (summary, ranking,
 * horas, status, grupo, tipo, corretivas x planejadas, drill-down) já vêm
 * RECORTADOS pela seleção da análise; a evolução por família e a auditoria não.
 */
export type CriticalEquipmentsPageData = CriticalEquipmentScopedData & {
  /** Painel "Qualidade dos dados" da aba (FASE 6). */
  dataQuality: DataQualitySummary;
  period: { startDate: string; endDate: string };
  /** Auditoria do período (hero) — sem a seleção da análise. */
  audit: CriticalEquipmentPeriodAudit;
  /** Evolução mensal de OS por FAMÍLIA (todas as máquinas do recorte, não só o Top N). */
  familyEvolution: FamilyEvolutionData;
  /** Campos do SAP presentes na base importada (TAREFA 15). */
  fieldAvailability: CriticalEquipmentFieldAvailability;
  filterOptions: CriticalEquipmentFilterOptions;
  source: "database" | "empty";
};

export type CriticalityScoreInput = {
  totalOrders: number;
  maxOrders: number;
  totalWorkedHours: number;
  maxWorkedHours: number;
  openOrders: number;
  maxOpenOrders: number;
  /** Reincidência: nº de OS além da 1ª (repetições) no ativo. */
  recurrence: number;
  maxRecurrence: number;
  /** Tendência de piora: variação positiva de OS nos últimos meses (0–1). */
  worseningTrend: number;
};

/* ------------------------------------------------------------------ */
/* Evolução mensal por família + drill-down                           */
/* ------------------------------------------------------------------ */

/** Métrica do gráfico de evolução. Custos ficam de fora até a fonte ser validada. */
export type FamilyEvolutionMetric = "orders" | "hours";

export type FamilyEvolutionMonth = {
  /** YYYY-MM */
  period: string;
  /** MM/AAAA */
  label: string;
};

/** Uma família = uma série. Arrays alinhados com `FamilyEvolutionData.months`. */
export type FamilyEvolutionSeries = {
  family: string;
  totalOrders: number;
  totalWorkedHours: number;
  /** Máquinas distintas com OS no período. */
  machineCount: number;
  orders: number[];
  hours: number[];
  /** Máquinas distintas com OS em cada mês. */
  machines: number[];
};

export type FamilyEvolutionData = {
  /** Todos os meses do período filtrado, inclusive os sem OS. */
  months: FamilyEvolutionMonth[];
  /** TODAS as famílias do recorte, da maior para a menor em OS. */
  families: FamilyEvolutionSeries[];
  totalOrders: number;
  totalWorkedHours: number;
};

/** Seleção do drill-down (espelhada na URL). */
export type FamilyDrilldownSelection = {
  family: string;
  /** YYYY-MM; `null` = período inteiro. */
  month: string | null;
  /** TAG da máquina raiz. */
  machine: string | null;
  /** TAG do repartimento, `NO_COMPONENT_KEY` ou `ALL_ORDERS_KEY`. */
  component: string | null;
};

/** Composição reutilizada em todos os níveis (mesma regra corretiva/planejada da aba). */
export type FamilyDrilldownSplit = {
  totalOrders: number;
  correctiveOrders: number;
  plannedOrders: number;
  unclassifiedOrders: number;
  totalWorkedHours: number;
};

export type FamilyDrilldownMachine = FamilyDrilldownSplit & {
  rootTag: string;
  name: string;
  /** OS da máquina ÷ OS da família no recorte × 100. */
  percentOfFamily: number;
};

export type FamilyDrilldownComponent = FamilyDrilldownSplit & {
  /** TAG do repartimento ou `NO_COMPONENT_KEY`. */
  key: string;
  /** Código abaixo da máquina (ex.: CH-04-01); vazio para "sem repartimento". */
  code: string;
  /** Descrição do cadastro de locais; `null` quando não cadastrada. */
  description: string | null;
  /** Rótulo exibido: "Descrição (código)", só o código, ou "Sem repartimento informado". */
  label: string;
  registered: boolean;
  /** OS do repartimento ÷ OS da máquina no recorte × 100. */
  percentOfMachine: number;
  /** OS na janela de recorrência (mês selecionado + 2 anteriores), `null` sem mês. */
  recurrenceOrders: number | null;
  /** Meses da janela com ao menos uma OS neste repartimento. */
  recurrenceActiveMonths: number | null;
};

export type FamilyDrilldownMachineDetail = {
  rootTag: string;
  name: string;
  split: FamilyDrilldownSplit;
  /** Locais filhos diretos cadastrados para a máquina. */
  registeredChildren: number;
  /** false = nenhuma subdivisão técnica cadastrada nem usada pelas OS. */
  hasHierarchy: boolean;
  components: FamilyDrilldownComponent[];
  coverage: { identified: number; unidentified: number; percent: number };
  /** Janela de recorrência efetivamente usada (limitada ao período filtrado). */
  recurrenceWindow: { months: FamilyEvolutionMonth[]; limitedByPeriod: boolean } | null;
};

export type FamilyDrilldownOrders = {
  scopeLabel: string;
  total: number;
  /** true quando a lista foi cortada em `items.length` (o total segue correto). */
  truncated: boolean;
  items: CriticalEquipmentServiceOrder[];
};

export type FamilyDrilldownResponse = {
  /** Seleção efetivamente aplicada (níveis inválidos voltam como `null`). */
  selection: FamilyDrilldownSelection;
  period: { startDate: string; endDate: string };
  family: FamilyDrilldownSplit & { machineCount: number };
  /** Variação vs. mês anterior (%). `null` quando não há base comparável. */
  variationVsPreviousMonth: number | null;
  machines: FamilyDrilldownMachine[];
  machine: FamilyDrilldownMachineDetail | null;
  orders: FamilyDrilldownOrders | null;
};

/* ------------------------------------------------------------------ */
/* Seleção da análise (estado único que recorta a página)             */
/* ------------------------------------------------------------------ */

/**
 * Seleção FAMÍLIA → MÊS → MÁQUINA → REPARTIMENTO. Aplicada DEPOIS dos filtros
 * gerais (interseção) e compartilhada por todos os dashboards abaixo do gráfico
 * de evolução — KPIs, ranking, horas, status, grupo, corretivas x planejadas,
 * tipo de atividade, tabela e drill-down.
 */
export type CriticalEquipmentSelection = {
  family: string | null;
  /** YYYY-MM */
  month: string | null;
  /** TAG da máquina raiz. */
  machine: string | null;
  /** TAG do repartimento, `NO_COMPONENT_KEY` ou `ALL_ORDERS_KEY` (= sem recorte). */
  partition: string | null;
};

export type CriticalEquipmentSelectionContext = {
  active: boolean;
  /** Caminho legível: ["Multifio", "Agosto/2026", "MULTIFIO 04 BM", "CHUVEIRO (CH-04-01)"]. */
  path: Array<{ level: "family" | "month" | "machine" | "partition"; label: string }>;
  /** Rótulo curto para os títulos: "MULTIFIO 04 BM · Agosto/2026". */
  label: string;
  /** OS no recorte selecionado. */
  totalOrders: number;
};

/** Auditoria do período (hero): independe da seleção da análise. */
export type CriticalEquipmentPeriodAudit = {
  rawOrders: number;
  ignoredInvalidEquipment: number;
  consideredOrders: number;
  programmedPreventiveOrders: number;
  ordersWithoutTechnicalCode: number;
};

/** Tudo o que muda com a seleção — devolvido de uma vez (página e API usam o mesmo builder). */
export type CriticalEquipmentScopedData = {
  selection: CriticalEquipmentSelection;
  context: CriticalEquipmentSelectionContext;
  summary: CriticalEquipmentSummary;
  ranking: CriticalEquipmentItem[];
  hours: CriticalEquipmentHoursPoint[];
  statusDistribution: CriticalEquipmentStatusSlice[];
  planningGroupDistribution: CriticalEquipmentPlanningGroupSlice[];
  activityDistribution: CriticalEquipmentActivitySlice[];
  correctivePlanned: CriticalEquipmentCorrectivePlannedData;
  drilldown: FamilyDrilldownResponse | null;
};

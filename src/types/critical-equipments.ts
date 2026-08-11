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

export type CriticalEquipmentsPageData = {
  period: { startDate: string; endDate: string };
  summary: CriticalEquipmentSummary;
  ranking: CriticalEquipmentItem[];
  hours: CriticalEquipmentHoursPoint[];
  statusDistribution: CriticalEquipmentStatusSlice[];
  trend: CriticalEquipmentTrendPoint[];
  /** Dashboard "Ordens por Grupo de Planejamento" (TAREFA 3). */
  planningGroupDistribution: CriticalEquipmentPlanningGroupSlice[];
  /** Dashboard "Ordens por Tipo de Atividade" (TAREFA 5). */
  activityDistribution: CriticalEquipmentActivitySlice[];
  /** Dashboard "Ordens Corretivas x Planejadas" (TAREFA 6). */
  correctivePlanned: CriticalEquipmentCorrectivePlannedData;
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

import type { DataQualitySummary } from "@/types/data-quality";
import type { PlanningGroupKey } from "@/utils/service-order-planning";
export type ServiceOrderStatusLabel =
  | "ABERTA"
  | "LIBERADA"
  | "EM_ANDAMENTO"
  | "AGUARDANDO_MATERIAL"
  | "FECHADA"
  | "CANCELADA";

export type ServiceOrderListItem = {
  id: string;
  osNumber: string;
  title: string;
  openedAt: string | null;
  status: ServiceOrderStatusLabel;
  statusSapRaw: string | null;
  technicalObject: string;
  equipmentName: string | null;
  equipmentCode: string | null;
  responsibleName: string | null;
  responsibleId: string | null;
  planningGroup: string | null;
  planningGroupCode: string | null;
  workCenter: string | null;
  workedHours: number | null;
  operation: string | null;
  operationCode: string | null;
};

export type ServiceOrdersPageData = {
  orders: ServiceOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filterOptions: ServiceOrderFilterOptions;
  /** Cards e gráficos gerenciais do recorte filtrado (FASE 10). */
  dashboard: ServiceOrderDashboard;
  /** Painel "Qualidade dos dados" da aba. */
  dataQuality: DataQualitySummary;
  source: ServiceOrdersSource;
  /** Data (ISO) da última importação de Ordens de Serviço, se houver. */
  lastImportAt: string | null;
};

/**
 * Origem dos dados exibidos na aba Ordens de Serviço.
 *
 * - "database": leitura real do PostgreSQL/Supabase.
 * - "empty": a consulta falhou e a aba exibe estado vazio. NUNCA dados fictícios —
 *   mesma política já adotada por `dashboard.service.getEmptyDashboardData`, para o
 *   gestor não tomar decisão sobre ordens que não existem.
 */
export type ServiceOrdersSource = "database" | "empty";

export type ServiceOrdersQueryParams = {
  search?: string;
  osNumber?: string;
  /** Multi-seleção de status (OR dentro do grupo). */
  statuses?: ServiceOrderStatusLabel[];
  /** Busca textual de objeto técnico (equipmentName/Code/technicalObjectRaw). */
  equipment?: string;
  /** Multi-seleção de área de manutenção (OR dentro do grupo). */
  areas?: string[];
  /** Multi-seleção de grupo de planejamento (OR dentro do grupo). */
  planningGroups?: string[];
  /** Multi-seleção de responsável, incluindo "SEM RESPONSÁVEL" (OR dentro do grupo). */
  responsibles?: string[];
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

/** Estado de filtros aplicados (lido da URL) repassado ao componente cliente. */
export type AppliedServiceOrderFilters = {
  search: string;
  osNumber: string;
  statuses: ServiceOrderStatusLabel[];
  equipment: string;
  areas: string[];
  planningGroups: string[];
  responsibles: string[];
  startDate: string;
  endDate: string;
};

export type ServiceOrdersResult = {
  data: ServiceOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  source: ServiceOrdersSource;
};

export type ServiceOrderFilterOptions = {
  statuses: ServiceOrderStatusLabel[];
  areas: string[];
  planningGroups: string[];
  responsibles: string[];
  equipments: string[];
  /**
   * Quantos registros cada opção tem NO RECORTE atual — exibido ao lado do rótulo.
   * A lista já só contém opções com dados; a contagem mostra o peso de cada uma.
   */
  counts: {
    areas: Record<string, number>;
    planningGroups: Record<string, number>;
    responsibles: Record<string, number>;
    equipments: Record<string, number>;
    statuses: Record<string, number>;
  };
};

/** Uma fatia nomeada com contagem (gráficos de barras/rosca da aba). */
export type ServiceOrderSlice = {
  name: string;
  value: number;
};

/**
 * Campos do SAP que o dashboard precisa e que podem não vir na planilha.
 * Quando false, o indicador correspondente NÃO é renderizado — vira aviso.
 */
export type ServiceOrderFieldAvailability = {
  /** `planningActivityType` preenchido em ao menos uma OS do recorte. */
  planningActivityType: boolean;
  /** `planningGroup` preenchido em ao menos uma OS do recorte. */
  planningGroup: boolean;
  /**
   * Data de vencimento planejada. SEMPRE false: o model `ServiceOrder` não tem o
   * campo. Existe para o card "OS em atraso" poder declarar por que não aparece,
   * em vez de exibir "n/d" — mesma decisão tomada em Preventivas Programadas.
   */
  dueDate: boolean;
};

/**
 * DASHBOARD GERENCIAL da aba Ordens de Serviço (FASE 10).
 *
 * Calculado sobre o MESMO recorte filtrado da tabela — uma única varredura, para os
 * cards e a tabela não poderem discordar. Antes o resumo da aba contava a base
 * inteira enquanto a tabela mostrava o filtro, e os dois números não batiam.
 */
export type ServiceOrderDashboard = {
  /** Total de OS no recorte — é o mesmo `total` da tabela. */
  total: number;
  abertas: number;
  fechadas: number;
  /** Soma de `workedHours` no recorte. */
  workedHours: number;
  /**
   * Tempo médio de execução (dias corridos entre abertura e fechamento), só sobre
   * as OS fechadas que têm as DUAS datas. null quando nenhuma tem.
   */
  averageExecutionDays: number | null;
  /** Quantas OS fechadas entraram na média acima (transparência do denominador). */
  executionSampleSize: number;
  /** Máquina com mais ORDENS no recorte — o 1º do `equipmentRanking`. */
  topEquipment: ServiceOrderSlice | null;
  topResponsible: ServiceOrderSlice | null;

  /** Aderência de execução por área (grupo de planejamento) — substitui "OS por status". */
  adherenceByArea: ServiceOrderAdherenceByArea;
  byPlanningGroup: ServiceOrderSlice[];
  byActivityType: ServiceOrderSlice[];
  /** Corretivas x planejadas pela regra oficial do portal (PL-/PV- no título). */
  correctiveVsPlanned: ServiceOrderSlice[];
  /** TODAS as máquinas do recorte (não só o top 10), já ordenadas por mais OS. */
  equipmentRanking: ServiceOrderEquipmentRankingItem[];

  fieldAvailability: ServiceOrderFieldAvailability;
};

/* ------------------------------------------------------------------ */
/* Aderência de execução por área                                      */
/* ------------------------------------------------------------------ */

/**
 * Contagens de uma área (ou do total), em ORDENS distintas. Duas dimensões
 * independentes sobre o MESMO conjunto: STATUS (abertas + fechadas = total) e
 * CLASSIFICAÇÃO (corretivas + planejadas = total).
 */
export type ServiceOrderAdherenceTotals = {
  total: number;
  open: number;
  closed: number;
  /** Fechadas ÷ total × 100, duas casas. `null` quando total = 0 — nunca 0%. */
  adherence: number | null;
  corrective: number;
  /** Plano programado PL/PV (`isProgrammedPreventiveOrder`). */
  planned: number;
  correctivePercent: number | null;
  plannedPercent: number | null;
};

/** Uma área (grupo de planejamento normalizado) no painel de aderência. */
export type ServiceOrderAreaAdherence = ServiceOrderAdherenceTotals & {
  /** Chave do normalizador central (`resolvePlanningGroup`). */
  key: PlanningGroupKey;
  /** Rótulo gerencial (`PLANNING_GROUP_LABELS`). */
  area: string;
};

export type ServiceOrderAdherenceByArea = ServiceOrderAdherenceTotals & {
  /** Só as áreas com OS no recorte, na ordem oficial `PLANNING_GROUP_ORDER`. */
  areas: ServiceOrderAreaAdherence[];
  /** Linhas (operações) que deram origem às ordens — é o "Total de OS" da tabela. */
  operationRows: number;
  /** O recorte inclui o dia de hoje: os números ainda podem mudar. */
  periodInProgress: boolean;
  /** O recorte cabe em um único mês (decide o texto da nota de período em andamento). */
  singleMonth: boolean;
};

/** Filtros do detalhe de uma área — combináveis entre si. */
export type ServiceOrderAreaStatusFilter = "all" | "open" | "closed";
export type ServiceOrderAreaTypeFilter = "all" | "corrective" | "planned";

/** Uma ORDEM (uma linha por osNumber) no detalhe de uma área. */
export type ServiceOrderAreaOrderItem = {
  osNumber: string;
  title: string;
  technicalObject: string;
  responsibleName: string | null;
  /** Status da primeira operação pendente (a que impede o encerramento), ou da primeira operação. */
  status: ServiceOrderStatusLabel;
  statusSapRaw: string | null;
  closed: boolean;
  /** "PL" / "PV" = planejada; `null` = corretiva. */
  programmedType: "PL" | "PV" | null;
  openedAt: string | null;
  /** Dias corridos desde a data-base até hoje, só para ordens abertas. */
  daysOpen: number | null;
  totalOperations: number;
  openOperations: number;
};

export type ServiceOrderAreaOrdersResult = {
  key: PlanningGroupKey;
  area: string;
  status: ServiceOrderAreaStatusFilter;
  type: ServiceOrderAreaTypeFilter;
  /** Quantas ordens atendem aos filtros (pode ser maior que `items.length`). */
  totalMatching: number;
  /** Abertas primeiro; dentro de cada grupo, as mais antigas primeiro. Limitado a `limit`. */
  items: ServiceOrderAreaOrderItem[];
  limit: number;
};

/* ------------------------------------------------------------------ */
/* Análise de ordens por equipamento                                   */
/* ------------------------------------------------------------------ */

/**
 * Uma MÁQUINA no ranking "Análise de ordens por equipamento".
 *
 * Máquina = equipamento RAIZ do local de instalação (`getRootFunctionalLocation`,
 * a mesma resolução de Equipamentos Críticos): OS abertas em componentes somam para
 * a máquina. Contagens em ORDENS distintas (osNumber); horas = soma das operações.
 */
export type ServiceOrderEquipmentRankingItem = {
  /** TAG da máquina raiz — a chave técnica (nunca o nome). */
  key: string;
  name: string;
  familyLabel: string;
  total: number;
  open: number;
  closed: number;
  corrective: number;
  planned: number;
  hours: number;
};

/** Barra nomeada (grupo, tipo, status, responsável) no detalhe da máquina. */
export type ServiceOrderEquipmentSlice = {
  key: string;
  label: string;
  count: number;
};

export type ServiceOrderEquipmentEvolutionPoint = {
  /** "2026-09" (mês) ou "2026-09-14" (dia). */
  key: string;
  label: string;
  orders: number;
  hours: number;
};

export type ServiceOrderEquipmentRepartimento = {
  /** TAG do filho de 1º nível; `null` = OS registrada na própria máquina. */
  tag: string | null;
  /** Parte do TAG abaixo da máquina (ex.: "FR-03-01"). */
  code: string | null;
  /** Descrição oficial do cadastro de locais; `null` quando não cadastrado (nunca inventada). */
  description: string | null;
  orders: number;
  open: number;
  hours: number;
};

/** Uma ORDEM da máquina (uma linha por osNumber). */
export type ServiceOrderEquipmentOrder = {
  osNumber: string;
  title: string;
  openedAt: string | null;
  /** Status da 1ª operação pendente (a que impede o encerramento), ou da 1ª operação. */
  status: ServiceOrderStatusLabel;
  closed: boolean;
  planningGroupKey: PlanningGroupKey;
  planningGroupLabel: string;
  activityTypeLabel: string;
  /** "PL" / "PV" = planejada; `null` = corretiva. */
  programmedType: "PL" | "PV" | null;
  responsibleName: string | null;
  hours: number;
  /** TAG do local de instalação da ordem. */
  locationTag: string;
  /** TAG do repartimento (filho de 1º nível); `null` = na própria máquina. */
  repartimentoTag: string | null;
  daysOpen: number | null;
  totalOperations: number;
};

export type ServiceOrderEquipmentAnalysis = {
  key: string;
  name: string;
  familyLabel: string;
  /** Período dos filtros da página; `null` nas pontas = sem limite. */
  period: { from: string | null; to: string | null };
  totals: {
    total: number;
    open: number;
    closed: number;
    hours: number;
    /** Horas ÷ ordens; `null` sem ordens. */
    hoursPerOrder: number | null;
    corrective: number;
    planned: number;
    correctivePercent: number | null;
    plannedPercent: number | null;
  };
  lastOrder: { osNumber: string; openedAt: string; title: string } | null;
  /** Mais recorrente de cada dimensão; `null` quando não há dado confiável. */
  mostFrequent: {
    planningGroup: ServiceOrderEquipmentSlice | null;
    activityType: ServiceOrderEquipmentSlice | null;
    /** Nunca "SEM RESPONSÁVEL" — ausência de cadastro não é colaborador. */
    responsible: ServiceOrderEquipmentSlice | null;
  };
  byPlanningGroup: ServiceOrderEquipmentSlice[];
  byActivityType: ServiceOrderEquipmentSlice[];
  byStatus: ServiceOrderEquipmentSlice[];
  /** Mensal quando o recorte cobre mais de um mês; diária dentro de um mês. */
  evolution: { granularity: "month" | "day"; points: ServiceOrderEquipmentEvolutionPoint[] };
  repartimentos: ServiceOrderEquipmentRepartimento[];
  /** Colaboradores reais, mais OS primeiro. "SEM RESPONSÁVEL" fica em `quality`. */
  responsibles: ServiceOrderEquipmentSlice[];
  quality: {
    withoutResponsible: number;
    /** `planningActivityType` vazio: o tipo exibido foi DERIVADO pela regra central. */
    withoutStructuredActivityType: number;
    /** Registradas na própria máquina, sem componente. */
    withoutRepartimento: number;
    /** Repartimento cujo TAG não está no cadastro de locais (sem descrição oficial). */
    unregisteredRepartimento: number;
  };
  orders: ServiceOrderEquipmentOrder[];
};

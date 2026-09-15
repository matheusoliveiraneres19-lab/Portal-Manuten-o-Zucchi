import type { DataQualitySummary } from "@/types/data-quality";
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
  summary: ServiceOrdersSummary;
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

/** Um ponto da série mensal de abertas x fechadas. */
export type ServiceOrderMonthlyPoint = {
  /** Rótulo curto do mês (ex.: "ago/26"). */
  name: string;
  abertas: number;
  fechadas: number;
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
  topEquipment: ServiceOrderSlice | null;
  topResponsible: ServiceOrderSlice | null;

  openClosedByMonth: ServiceOrderMonthlyPoint[];
  byStatus: ServiceOrderSlice[];
  byPlanningGroup: ServiceOrderSlice[];
  byActivityType: ServiceOrderSlice[];
  /** Corretivas x planejadas pela regra oficial do portal (PL-/PV- no título). */
  correctiveVsPlanned: ServiceOrderSlice[];
  topEquipments: ServiceOrderSlice[];
  topResponsibles: ServiceOrderSlice[];

  fieldAvailability: ServiceOrderFieldAvailability;
};

export type ServiceOrdersSummary = {
  total: number;
  abertas: number;
  liberadas: number;
  emAndamento: number;
  aguardandoMaterial: number;
  fechadas: number;
  semResponsavel: number;
};

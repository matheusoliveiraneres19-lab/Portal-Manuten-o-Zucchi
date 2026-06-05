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
  source: "database" | "mock";
};

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
  source: "database" | "mock";
};

export type ServiceOrderFilterOptions = {
  statuses: ServiceOrderStatusLabel[];
  areas: string[];
  planningGroups: string[];
  responsibles: string[];
  equipments: string[];
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

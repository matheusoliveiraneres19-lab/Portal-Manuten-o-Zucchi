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
  status?: ServiceOrderStatusLabel | "TODOS" | "";
  equipment?: string;
  area?: string;
  startDate?: string;
  endDate?: string;
  planningGroup?: string;
  responsibleName?: string;
  page?: number;
  pageSize?: number;
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

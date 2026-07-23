import type { CollaboratorArea, CollaboratorStatus } from "@prisma/client";

export type { CollaboratorArea, CollaboratorStatus };

/** Indicadores de cadastro da equipe (cards da página Equipe de Manutenção). */
export type CollaboratorStats = {
  total: number;
  active: number;
  inactive: number;
  byArea: Record<CollaboratorArea, number>;
};

/** Linha de colaborador exposta pela API/serviço (datas serializadas em ISO). */
export type CollaboratorRow = {
  id: string;
  matricula: string;
  name: string;
  role: string | null;
  area: CollaboratorArea;
  shift: string | null;
  monthlyGoal: number;
  status: CollaboratorStatus;
  admissionDate: string | null;
  vacationStartDate: string | null;
  acquisitionPeriodStart: string | null;
  createdAt: string;
};

/** Ponto de horas apontadas em um mês (para o gráfico de evolução). */
export type CollaboratorMonthPoint = {
  ym: string;
  label: string;
  hours: number;
};

/* ------------------------------------------------------------------ */
/* ETAPA 3 — EPI, Ferramentas e Anexos                                */
/* ------------------------------------------------------------------ */

/** Status derivado de um EPI a partir da validade do CA. */
export type EpiDerivedStatus = "VALIDO" | "A_VENCER" | "VENCIDO";

/** EPI exposto pela API/serviço (datas em ISO; status já derivado no servidor). */
export type EpiItemRow = {
  id: string;
  name: string;
  caNumber: string;
  caValidUntil: string;
  deliveredAt: string | null;
  notes: string | null;
  status: EpiDerivedStatus;
  /** Dias até vencer (negativo = vencido há N dias). */
  daysToExpire: number;
};

/** Ferramenta sob responsabilidade do colaborador. */
export type ToolItemRow = {
  id: string;
  name: string;
  status: "EM_USO" | "DEVOLVIDA";
  assignedAt: string | null;
  returnedAt: string | null;
  notes: string | null;
};

export type AttachmentKindValue = "EPI_FICHA" | "TERMO_FERRAMENTA" | "OUTRO";

/** Metadado de anexo (o arquivo vive no Storage privado, nunca no banco). */
export type AttachmentRow = {
  id: string;
  kind: AttachmentKindValue;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
};

/** EPI a vencer/vencido com o colaborador dono (para alerta futuro no dashboard). */
export type ExpiringEpiRow = EpiItemRow & {
  collaboratorId: string;
  collaboratorName: string;
};

/** Payload da ficha do colaborador (ETAPA 2 + 3). */
export type CollaboratorDetailData = {
  collaborator: CollaboratorRow;
  monthly: CollaboratorMonthPoint[];
  currentMonthHours: number;
  /** Saldo do mês corrente (horas − meta). */
  monthBalance: number;
  /** Saldo do banco de horas acumulado (meses com apontamento). */
  accumulatedBalance: number;
  normalHours: number;
  extraHours: number;
  missingHours: number;
  vacation: {
    admissionDate: string | null;
    vacationStartDate: string | null;
    acquisitionPeriodStart: string | null;
    acquisitionPeriodEnd: string | null;
    legalLimit: string | null;
    daysToVacation: number | null;
    daysToLegalLimit: number | null;
    expiringSoon: boolean;
  };
  /** EPIs entregues ao colaborador (com status derivado). */
  epis: EpiItemRow[];
  /** Ferramentas sob responsabilidade. */
  tools: ToolItemRow[];
  /** Anexos — só preenchido para ADMIN/GESTOR. */
  attachments: AttachmentRow[];
  /** true se a sessão pode editar férias (ADMIN/GESTOR). */
  canEditVacation: boolean;
  /** true se a sessão pode gerenciar EPI/ferramentas/anexos (ADMIN/GESTOR). */
  canManageAssets: boolean;
};

export type CollaboratorListParams = {
  status?: CollaboratorStatus;
  area?: CollaboratorArea;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type CollaboratorListResult = {
  data: CollaboratorRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/* ------------------------------------------------------------------ */
/* ETAPA 2 — Horas × colaborador                                      */
/* ------------------------------------------------------------------ */

/** Filtro de tipo de OS considerado nas horas da equipe. */
export type TeamHoursOsType = "all" | "corrective" | "preventive";

/** Linha de horas da equipe: colaborador + horas apontadas no período. */
export type TeamHoursRow = {
  id: string;
  matricula: string;
  name: string;
  role: string | null;
  area: CollaboratorArea;
  status: CollaboratorStatus;
  monthlyGoal: number;
  hours: number;
  /** Nº de Ordens de Manutenção que compõem as horas do colaborador no período. */
  orderCount: number;
  /** % da meta mensal (hours / monthlyGoal × 100). null se meta = 0. */
  goalPercent: number | null;
};

/** OS que compõe as horas de um colaborador (drill-down). Fonte: ServiceOrder. */
export type TeamHoursOrderRow = {
  id: string;
  osNumber: string;
  title: string;
  equipmentName: string | null;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
  workedHours: number;
  /** Classificação por título: PL/PV (preventiva programada) ou Corretiva. */
  osType: "PL" | "PV" | "Corretiva";
  planningGroup: string | null;
};

/** Payload do drill-down de horas de um colaborador. */
export type CollaboratorHoursOrdersResult = {
  collaboratorName: string;
  matricula: string;
  startDate: string;
  endDate: string;
  totalHours: number;
  orders: TeamHoursOrderRow[];
};

/** Apontamento de horas sem colaborador cadastrado (gap de cadastro). */
export type UnmatchedHoursRow = {
  userName: string;
  hours: number;
};

/** Meta mensal vigente de uma área (para o editor de metas por área). */
export type AreaGoal = {
  area: CollaboratorArea;
  goal: number;
  /** Quantos colaboradores há na área. */
  count: number;
  /** true se todos na área compartilham a mesma meta. */
  uniform: boolean;
};

export type TeamHoursResult = {
  startDate: string;
  endDate: string;
  /** Tipo de OS efetivamente aplicado no cálculo (default "all"). */
  osType: TeamHoursOsType;
  rows: TeamHoursRow[];
  unmatched: UnmatchedHoursRow[];
  totalHours: number;
  totalGoal: number;
  matchedCollaborators: number;
};

/** Entrada de criação/atualização (campos opcionais usam defaults do schema). */
export type CollaboratorInput = {
  matricula?: string;
  name?: string;
  role?: string | null;
  area?: CollaboratorArea;
  shift?: string | null;
  monthlyGoal?: number;
  status?: CollaboratorStatus;
  admissionDate?: string | null;
  vacationStartDate?: string | null;
  acquisitionPeriodStart?: string | null;
};

import type { CollaboratorArea, CollaboratorStatus } from "@prisma/client";

export type { CollaboratorArea, CollaboratorStatus };

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

/** Payload da ficha do colaborador (ETAPA 2). */
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
  /** true se a sessão pode editar férias (ADMIN/GESTOR). */
  canEditVacation: boolean;
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
  /** % da meta mensal (hours / monthlyGoal × 100). null se meta = 0. */
  goalPercent: number | null;
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

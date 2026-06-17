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
  createdAt: string;
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
};

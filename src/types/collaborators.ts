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

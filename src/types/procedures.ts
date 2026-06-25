import type { ProcedureCategoryName, ProcedureLevel, ProcedureStatus } from "@/constants/procedure-categories";

/** Item resumido (listas, cards, busca). */
export type ProcedureListItem = {
  id: string;
  slug: string;
  title: string;
  categoryName: string;
  level: ProcedureLevel;
  estimatedMinutes: number | null;
  targetAudience: string | null;
  responsible: string | null;
  status: ProcedureStatus;
  tags: string[];
  isFeatured: boolean;
  isOnboarding: boolean;
  viewCount: number;
  updatedAt: string;
};

/** Procedimento completo (página de detalhe). */
export type ProcedureDetail = ProcedureListItem & {
  summary: string | null;
  objective: string | null;
  whenToUse: string | null;
  content: string | null;
  commonMistakes: string | null;
  createdAt: string;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
};

/** Contagem por categoria (cards de categoria). */
export type ProcedureCategoryCount = {
  name: ProcedureCategoryName;
  description: string;
  count: number;
};

export type ProcedureSort = "recent" | "popular" | "title";

export type ProcedureListFilters = {
  search?: string;
  categoryName?: string;
  level?: string;
  status?: string;
  /** Inclui status "Arquivado" (somente em telas administrativas). */
  includeArchived?: boolean;
  sort?: ProcedureSort;
};

/** Payload de criação/edição (vindo do formulário). */
export type ProcedureInput = {
  title: string;
  categoryName: string;
  summary: string;
  objective?: string | null;
  whenToUse?: string | null;
  content: string;
  commonMistakes?: string | null;
  level?: string;
  estimatedMinutes?: number | null;
  targetAudience?: string | null;
  responsible?: string | null;
  status?: string;
  tags?: string[] | string | null;
  isFeatured?: boolean;
  isOnboarding?: boolean;
};

/** Resumo para a página da Central (montado no service). */
export type ProceduresCenterData = {
  totalPublished: number;
  categories: ProcedureCategoryCount[];
  featured: ProcedureListItem[];
  onboarding: ProcedureListItem[];
  all: ProcedureListItem[];
};

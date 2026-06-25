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

/** Tipo de material de apoio para a UI escolher como renderizar. */
export type ProcedureAttachmentKind = "image" | "pdf" | "video" | "link";

/** Material de apoio com URL já resolvida (assinada para uploads, direta para links). */
export type ProcedureAttachmentItem = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number | null;
  description: string | null;
  kind: ProcedureAttachmentKind;
  /** true quando é link externo (não está no Storage). */
  isExternal: boolean;
  /** URL para abrir/baixar/exibir (assinada e temporária quando é upload). */
  url: string;
  /** URL de incorporação (embed) quando reconhecida (YouTube/Vimeo). */
  embedUrl: string | null;
  createdAt: string;
};

/** Procedimento completo (página de detalhe). */
export type ProcedureDetail = ProcedureListItem & {
  summary: string | null;
  objective: string | null;
  whenToUse: string | null;
  content: string | null;
  commonMistakes: string | null;
  onboardingOrder: number | null;
  createdAt: string;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
};

/** Detalhe + estado do usuário atual (favorito, leitura) + materiais de apoio. */
export type ProcedureDetailForUser = ProcedureDetail & {
  attachments: ProcedureAttachmentItem[];
  isFavorite: boolean;
  readConfirmedAt: string | null;
};

/** Progresso da trilha de funcionário novo para o usuário atual. */
export type OnboardingProgress = {
  total: number;
  completed: number;
  percent: number;
};

/** Indicadores discretos do topo da Central. */
export type ProceduresIndicators = {
  totalPublished: number;
  mostAccessedTitle: string | null;
  pendingReadCount: number;
  onboardingPercent: number;
  withAttachmentsCount: number;
  recentlyUpdatedCount: number;
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
  onboardingOrder?: number | null;
};

/** Resumo para a página da Central (montado no service). */
export type ProceduresCenterData = {
  totalPublished: number;
  categories: ProcedureCategoryCount[];
  featured: ProcedureListItem[];
  onboarding: ProcedureListItem[];
  all: ProcedureListItem[];
  /** Favoritos do usuário atual. */
  favorites: ProcedureListItem[];
  /** IDs de procedimentos que o usuário já confirmou leitura. */
  readIds: string[];
  onboardingProgress: OnboardingProgress;
  indicators: ProceduresIndicators;
};

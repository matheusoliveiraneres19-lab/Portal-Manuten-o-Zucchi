import { ProcedureCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PROCEDURE_CATEGORY_META,
  isProcedureCategoryName,
  isProcedureLevel,
  isProcedureStatus
} from "@/constants/procedure-categories";
import { PROCEDURE_ATTACHMENTS_BUCKET, createSignedUrl, removeObject } from "@/lib/supabase-storage";
import { getEmbeddableVideoUrl, isVideoUrl } from "@/utils/video-embed";
import type {
  OnboardingProgress,
  ProcedureAttachmentItem,
  ProcedureAttachmentKind,
  ProcedureCategoryCount,
  ProcedureDetail,
  ProcedureDetailForUser,
  ProcedureInput,
  ProcedureListFilters,
  ProcedureListItem,
  ProceduresCenterData,
  ProceduresIndicators
} from "@/types/procedures";

/** Erros de domínio para a camada de API mapear em 400/404/409. */
export class ProcedureValidationError extends Error {}
export class ProcedureConflictError extends Error {}
export class ProcedureNotFoundError extends Error {}

const ARCHIVED = "Arquivado";
const FEATURED_LIMIT = 6;
const LIST_LIMIT = 300;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Mapeia a categoria de exibição para o enum legado `category` (compat. KPI/dados antigos). */
function mapCategoryNameToEnum(name: string): ProcedureCategory {
  switch (name) {
    case "Mecânica":
      return ProcedureCategory.MECANICA;
    case "Elétrica":
      return ProcedureCategory.ELETRICA;
    case "Lubrificação":
      return ProcedureCategory.LUBRIFICACAO;
    case "Segurança":
      return ProcedureCategory.SEGURANCA;
    case "SAP/Fiori":
    case "Ordem de Serviço":
      return ProcedureCategory.PCM;
    case "PC-Factory":
      return ProcedureCategory.OPERACIONAL;
    default:
      return ProcedureCategory.OUTROS;
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Garante slug único (acrescenta -2, -3… em colisão). Ignora o próprio id em edições. */
async function ensureUniqueSlug(base: string, ignoreId?: string): Promise<string> {
  const root = base || "procedimento";
  let candidate = root;
  let suffix = 2;
  // Limite de segurança para não loopar indefinidamente.
  while (suffix < 1000) {
    const existing = await prisma.procedure.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === ignoreId) return candidate;
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  return `${root}-${Date.now()}`;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function serializeTags(tags: ProcedureInput["tags"]): string | null {
  if (!tags) return null;
  const list = Array.isArray(tags) ? tags : tags.split(",");
  const clean = list.map((tag) => tag.trim()).filter(Boolean);
  return clean.length ? clean.join(", ") : null;
}

const listSelect = {
  id: true,
  slug: true,
  title: true,
  categoryName: true,
  category: true,
  level: true,
  estimatedMinutes: true,
  targetAudience: true,
  responsible: true,
  status: true,
  tags: true,
  isFeatured: true,
  isOnboarding: true,
  viewCount: true,
  updatedAt: true
} satisfies Prisma.ProcedureSelect;

type ListPayload = Prisma.ProcedureGetPayload<{ select: typeof listSelect }>;

function toListItem(record: ListPayload): ProcedureListItem {
  return {
    id: record.id,
    slug: record.slug ?? record.id,
    title: record.title,
    categoryName: record.categoryName ?? "Outros",
    level: (isProcedureLevel(record.level) ? record.level : "Básico") as ProcedureListItem["level"],
    estimatedMinutes: record.estimatedMinutes,
    targetAudience: record.targetAudience,
    responsible: record.responsible,
    status: (isProcedureStatus(record.status) ? record.status : "Publicado") as ProcedureListItem["status"],
    tags: parseTags(record.tags),
    isFeatured: record.isFeatured,
    isOnboarding: record.isOnboarding,
    viewCount: record.viewCount,
    updatedAt: record.updatedAt.toISOString()
  };
}

/* ------------------------------------------------------------------ */
/* Leitura                                                            */
/* ------------------------------------------------------------------ */

function buildWhere(filters: ProcedureListFilters): Prisma.ProcedureWhereInput {
  const and: Prisma.ProcedureWhereInput[] = [];

  // A Central lista apenas procedimentos com categoria de exibição (categoryName).
  // Registros LEGADOS do model Procedure (sem categoryName) ficam de fora — eles
  // seguem servindo o KPI "Procedimentos Ativos" (que usa `active`), sem poluir a tela.
  and.push({ NOT: { categoryName: null } });

  if (filters.status && isProcedureStatus(filters.status)) {
    and.push({ status: filters.status });
  } else if (!filters.includeArchived) {
    // Tela pública: nunca mostra arquivados por padrão.
    and.push({ NOT: { status: ARCHIVED } });
  }

  if (filters.categoryName) and.push({ categoryName: filters.categoryName });
  if (filters.level && isProcedureLevel(filters.level)) and.push({ level: filters.level });

  const term = filters.search?.trim();
  if (term) {
    and.push({
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { categoryName: { contains: term, mode: "insensitive" } },
        { summary: { contains: term, mode: "insensitive" } },
        { objective: { contains: term, mode: "insensitive" } },
        { whenToUse: { contains: term, mode: "insensitive" } },
        { content: { contains: term, mode: "insensitive" } },
        { tags: { contains: term, mode: "insensitive" } },
        { targetAudience: { contains: term, mode: "insensitive" } },
        { responsible: { contains: term, mode: "insensitive" } }
      ]
    });
  }

  return and.length ? { AND: and } : {};
}

function buildOrderBy(sort: ProcedureListFilters["sort"]): Prisma.ProcedureOrderByWithRelationInput {
  if (sort === "popular") return { viewCount: "desc" };
  if (sort === "title") return { title: "asc" };
  return { updatedAt: "desc" };
}

export async function getProcedures(filters: ProcedureListFilters = {}): Promise<ProcedureListItem[]> {
  const rows = await prisma.procedure.findMany({
    where: buildWhere(filters),
    orderBy: buildOrderBy(filters.sort),
    take: LIST_LIMIT,
    select: listSelect
  });
  return rows.map(toListItem);
}

export async function getProcedureBySlug(slug: string): Promise<ProcedureDetail | null> {
  const term = slug.trim();
  if (!term) return null;
  const record = await prisma.procedure.findFirst({
    where: { OR: [{ slug: term }, { id: term }] }
  });
  if (!record) return null;
  return {
    ...toListItem(record),
    summary: record.summary,
    objective: record.objective,
    whenToUse: record.whenToUse,
    content: record.content,
    commonMistakes: record.commonMistakes,
    onboardingOrder: record.onboardingOrder,
    createdAt: record.createdAt.toISOString(),
    lastReviewedAt: record.lastReviewedAt ? record.lastReviewedAt.toISOString() : null,
    nextReviewAt: record.nextReviewAt ? record.nextReviewAt.toISOString() : null
  };
}

export async function getFeaturedProcedures(): Promise<ProcedureListItem[]> {
  const rows = await prisma.procedure.findMany({
    where: { status: "Publicado", isFeatured: true },
    orderBy: { viewCount: "desc" },
    take: FEATURED_LIMIT,
    select: listSelect
  });
  return rows.map(toListItem);
}

export async function getOnboardingProcedures(): Promise<ProcedureListItem[]> {
  const rows = await prisma.procedure.findMany({
    where: { status: "Publicado", isOnboarding: true },
    orderBy: [{ onboardingOrder: "asc" }, { createdAt: "asc" }],
    select: listSelect
  });
  return rows.map(toListItem);
}

export async function getProcedureCategories(): Promise<ProcedureCategoryCount[]> {
  const grouped = await prisma.procedure.groupBy({
    by: ["categoryName"],
    where: { status: "Publicado" },
    _count: { _all: true }
  });
  const counts = new Map<string, number>();
  for (const group of grouped) {
    if (group.categoryName) counts.set(group.categoryName, group._count._all);
  }
  return PROCEDURE_CATEGORY_META.map((meta) => ({
    name: meta.name,
    description: meta.description,
    count: counts.get(meta.name) ?? 0
  }));
}

/** Monta tudo o que a página da Central precisa numa só chamada (por usuário). */
export async function getProceduresCenterData(userId?: string | null): Promise<ProceduresCenterData> {
  const [totalPublished, categories, featured, onboarding, all, favorites, readIds, mostAccessed, attachedIds] =
    await Promise.all([
      prisma.procedure.count({ where: { status: "Publicado", categoryName: { not: null } } }),
      getProcedureCategories(),
      getFeaturedProcedures(),
      getOnboardingProcedures(),
      getProcedures({ sort: "recent" }),
      userId ? getUserFavorites(userId) : Promise.resolve([] as ProcedureListItem[]),
      userId ? getUserReadIds(userId) : Promise.resolve([] as string[]),
      prisma.procedure.findFirst({
        where: { status: "Publicado", categoryName: { not: null }, viewCount: { gt: 0 } },
        orderBy: { viewCount: "desc" },
        select: { title: true }
      }),
      prisma.procedureAttachment.findMany({ distinct: ["procedureId"], select: { procedureId: true } })
    ]);

  const readSet = new Set(readIds);
  const publishedIds = new Set(all.map((item) => item.id));
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const onboardingCompleted = onboarding.filter((item) => readSet.has(item.id)).length;
  const onboardingProgress: OnboardingProgress = {
    total: onboarding.length,
    completed: onboardingCompleted,
    percent: onboarding.length > 0 ? Math.round((onboardingCompleted / onboarding.length) * 100) : 0
  };

  const indicators: ProceduresIndicators = {
    totalPublished,
    mostAccessedTitle: mostAccessed?.title ?? null,
    pendingReadCount: all.filter((item) => !readSet.has(item.id)).length,
    onboardingPercent: onboardingProgress.percent,
    withAttachmentsCount: attachedIds.filter((row) => publishedIds.has(row.procedureId)).length,
    recentlyUpdatedCount: all.filter((item) => new Date(item.updatedAt) >= thirtyDaysAgo).length
  };

  return { totalPublished, categories, featured, onboarding, all, favorites, readIds, onboardingProgress, indicators };
}

/* ------------------------------------------------------------------ */
/* Materiais de apoio (anexos)                                        */
/* ------------------------------------------------------------------ */

/** Resolve um id OU slug para o id real do procedimento (público). */
export async function resolveProcedureId(idOrSlug: string): Promise<string | null> {
  const record = await resolveId(idOrSlug);
  return record?.id ?? null;
}

function attachmentKind(fileType: string, url: string): ProcedureAttachmentKind {
  if (fileType.startsWith("image/")) return "image";
  if (fileType === "application/pdf") return "pdf";
  if (fileType.startsWith("video/")) return "video";
  // Links externos reconhecidos como vídeo (YouTube/Drive/Vimeo/.mp4) viram "video".
  if (fileType === "link") return isVideoUrl(url) ? "video" : "link";
  return "link";
}

type AttachmentRecord = {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  fileSize: number | null;
  description: string | null;
  createdAt: Date;
};

async function toAttachmentItem(record: AttachmentRecord): Promise<ProcedureAttachmentItem> {
  const isExternal = record.fileType === "link";
  let url = record.fileUrl;
  if (!isExternal) {
    try {
      // URL assinada de 1h (material de treinamento, não dado pessoal). Regerada a cada load.
      url = await createSignedUrl(record.fileUrl, 3600, PROCEDURE_ATTACHMENTS_BUCKET);
    } catch {
      url = "";
    }
  }
  return {
    id: record.id,
    fileName: record.fileName,
    fileType: record.fileType,
    fileSize: record.fileSize,
    description: record.description,
    kind: attachmentKind(record.fileType, record.fileUrl),
    isExternal,
    url,
    embedUrl: isExternal ? getEmbeddableVideoUrl(record.fileUrl) : null,
    createdAt: record.createdAt.toISOString()
  };
}

export async function getProcedureAttachments(procedureId: string): Promise<ProcedureAttachmentItem[]> {
  const rows = await prisma.procedureAttachment.findMany({
    where: { procedureId },
    orderBy: { createdAt: "asc" }
  });
  return Promise.all(rows.map(toAttachmentItem));
}

export async function createAttachmentRecord(input: {
  procedureId: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  fileSize?: number | null;
  description?: string | null;
}): Promise<ProcedureAttachmentItem> {
  const created = await prisma.procedureAttachment.create({
    data: {
      procedureId: input.procedureId,
      fileName: input.fileName,
      fileType: input.fileType,
      fileUrl: input.fileUrl,
      fileSize: input.fileSize ?? null,
      description: input.description ?? null
    }
  });
  return toAttachmentItem(created);
}

/** Cria um anexo do tipo LINK externo (ex.: vídeo do YouTube). */
export async function createLinkAttachment(input: {
  procedureId: string;
  url: string;
  fileName?: string | null;
  description?: string | null;
}): Promise<ProcedureAttachmentItem> {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new ProcedureValidationError("Informe uma URL válida (http/https).");
  return createAttachmentRecord({
    procedureId: input.procedureId,
    fileName: input.fileName?.trim() || url,
    fileType: "link",
    fileUrl: url,
    description: input.description ?? null
  });
}

/** Busca o registro cru de um anexo (para excluir o objeto do Storage). */
export async function getAttachmentRecord(attId: string) {
  return prisma.procedureAttachment.findUnique({ where: { id: attId } });
}

export async function deleteAttachmentRecord(attId: string): Promise<void> {
  await prisma.procedureAttachment.delete({ where: { id: attId } });
}

/* ------------------------------------------------------------------ */
/* Favoritos                                                          */
/* ------------------------------------------------------------------ */

/** Alterna o favorito do usuário. Retorna o estado final (favoritado ou não). */
export async function toggleFavorite(userId: string, procedureId: string): Promise<{ favorited: boolean }> {
  const existing = await prisma.procedureFavorite.findUnique({
    where: { userId_procedureId: { userId, procedureId } },
    select: { id: true }
  });
  if (existing) {
    await prisma.procedureFavorite.delete({ where: { id: existing.id } });
    return { favorited: false };
  }
  await prisma.procedureFavorite.create({ data: { userId, procedureId } });
  return { favorited: true };
}

export async function getUserFavorites(userId: string): Promise<ProcedureListItem[]> {
  const favorites = await prisma.procedureFavorite.findMany({
    where: { userId, procedure: { status: "Publicado", categoryName: { not: null } } },
    orderBy: { createdAt: "desc" },
    select: { procedure: { select: listSelect } }
  });
  return favorites.map((favorite) => toListItem(favorite.procedure));
}

export async function isFavorited(userId: string, procedureId: string): Promise<boolean> {
  const existing = await prisma.procedureFavorite.findUnique({
    where: { userId_procedureId: { userId, procedureId } },
    select: { id: true }
  });
  return Boolean(existing);
}

/* ------------------------------------------------------------------ */
/* Confirmação de leitura ("Li e estou ciente")                       */
/* ------------------------------------------------------------------ */

export async function confirmRead(userId: string, procedureId: string): Promise<{ confirmedAt: string }> {
  const record = await prisma.procedureReadConfirmation.upsert({
    where: { userId_procedureId: { userId, procedureId } },
    update: {},
    create: { userId, procedureId }
  });
  return { confirmedAt: record.confirmedAt.toISOString() };
}

export async function getReadConfirmedAt(userId: string, procedureId: string): Promise<string | null> {
  const record = await prisma.procedureReadConfirmation.findUnique({
    where: { userId_procedureId: { userId, procedureId } },
    select: { confirmedAt: true }
  });
  return record ? record.confirmedAt.toISOString() : null;
}

export async function getUserReadIds(userId: string): Promise<string[]> {
  const rows = await prisma.procedureReadConfirmation.findMany({ where: { userId }, select: { procedureId: true } });
  return rows.map((row) => row.procedureId);
}

/** Detalhe + estado do usuário (favorito/leitura) + materiais de apoio. */
export async function getProcedureDetailForUser(
  slug: string,
  userId?: string | null
): Promise<ProcedureDetailForUser | null> {
  const detail = await getProcedureBySlug(slug);
  if (!detail) return null;
  const [attachments, favorite, readConfirmedAt] = await Promise.all([
    getProcedureAttachments(detail.id),
    userId ? isFavorited(userId, detail.id) : Promise.resolve(false),
    userId ? getReadConfirmedAt(userId, detail.id) : Promise.resolve(null)
  ]);
  return { ...detail, attachments, isFavorite: favorite, readConfirmedAt };
}

/* ------------------------------------------------------------------ */
/* Escrita                                                            */
/* ------------------------------------------------------------------ */

/** Valida e normaliza o payload do formulário; lança ProcedureValidationError. */
function normalizeInput(input: ProcedureInput, partial = false): Prisma.ProcedureUncheckedUpdateInput {
  const data: Prisma.ProcedureUncheckedUpdateInput = {};

  const setText = (key: keyof ProcedureInput, value: unknown, required = false, label = String(key)) => {
    if (value === undefined) {
      if (required && !partial) throw new ProcedureValidationError(`Campo obrigatório: ${label}.`);
      return undefined;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (required && !text) throw new ProcedureValidationError(`Campo obrigatório: ${label}.`);
    return text || null;
  };

  if (input.title !== undefined || !partial) {
    const title = setText("title", input.title, true, "título");
    if (title) data.title = title;
  }
  if (input.categoryName !== undefined || !partial) {
    if (!isProcedureCategoryName(input.categoryName)) {
      throw new ProcedureValidationError("Categoria inválida.");
    }
    data.categoryName = input.categoryName;
    data.category = mapCategoryNameToEnum(input.categoryName);
  }
  if (input.summary !== undefined || !partial) {
    data.summary = setText("summary", input.summary, true, "resumo");
  }
  if (input.content !== undefined || !partial) {
    data.content = setText("content", input.content, true, "conteúdo / passo a passo");
  }

  if (input.objective !== undefined) data.objective = setText("objective", input.objective);
  if (input.whenToUse !== undefined) data.whenToUse = setText("whenToUse", input.whenToUse);
  if (input.commonMistakes !== undefined) data.commonMistakes = setText("commonMistakes", input.commonMistakes);
  if (input.targetAudience !== undefined) data.targetAudience = setText("targetAudience", input.targetAudience);
  if (input.responsible !== undefined) data.responsible = setText("responsible", input.responsible);

  if (input.level !== undefined) {
    if (!isProcedureLevel(input.level)) throw new ProcedureValidationError("Nível inválido.");
    data.level = input.level;
  }
  if (input.status !== undefined) {
    if (!isProcedureStatus(input.status)) throw new ProcedureValidationError("Status inválido.");
    data.status = input.status;
  }
  if (input.estimatedMinutes !== undefined) {
    if (input.estimatedMinutes === null || input.estimatedMinutes === ("" as unknown)) {
      data.estimatedMinutes = null;
    } else {
      const minutes = Number(input.estimatedMinutes);
      if (!Number.isFinite(minutes) || minutes < 0) throw new ProcedureValidationError("Tempo estimado inválido.");
      data.estimatedMinutes = Math.round(minutes);
    }
  }
  if (input.onboardingOrder !== undefined) {
    if (input.onboardingOrder === null || input.onboardingOrder === ("" as unknown)) {
      data.onboardingOrder = null;
    } else {
      const order = Number(input.onboardingOrder);
      if (!Number.isFinite(order) || order < 0) throw new ProcedureValidationError("Ordem da trilha inválida.");
      data.onboardingOrder = Math.round(order);
    }
  }
  if (input.tags !== undefined) data.tags = serializeTags(input.tags);
  if (input.isFeatured !== undefined) data.isFeatured = Boolean(input.isFeatured);
  if (input.isOnboarding !== undefined) data.isOnboarding = Boolean(input.isOnboarding);

  return data;
}

export async function createProcedure(input: ProcedureInput): Promise<ProcedureDetail> {
  const data = normalizeInput(input, false);
  const title = typeof data.title === "string" ? data.title : "";
  const slug = await ensureUniqueSlug(slugify(title));

  const created = await prisma.procedure.create({
    data: {
      title,
      slug,
      categoryName: data.categoryName as string,
      category: (data.category as ProcedureCategory) ?? ProcedureCategory.OUTROS,
      summary: (data.summary as string | null) ?? null,
      content: (data.content as string | null) ?? null,
      objective: (data.objective as string | null) ?? null,
      whenToUse: (data.whenToUse as string | null) ?? null,
      commonMistakes: (data.commonMistakes as string | null) ?? null,
      targetAudience: (data.targetAudience as string | null) ?? null,
      responsible: (data.responsible as string | null) ?? null,
      level: (data.level as string) ?? "Básico",
      status: (data.status as string) ?? "Publicado",
      estimatedMinutes: (data.estimatedMinutes as number | null) ?? null,
      tags: (data.tags as string | null) ?? null,
      isFeatured: Boolean(data.isFeatured),
      isOnboarding: Boolean(data.isOnboarding),
      onboardingOrder: (data.onboardingOrder as number | null) ?? null
    }
  });

  const detail = await getProcedureBySlug(created.slug ?? created.id);
  if (!detail) throw new ProcedureNotFoundError("Procedimento recém-criado não encontrado.");
  return detail;
}

/** Resolve um id OU slug para o id real do registro. null se não existir. */
async function resolveId(idOrSlug: string): Promise<{ id: string; slug: string | null; title: string } | null> {
  const term = idOrSlug.trim();
  if (!term) return null;
  return prisma.procedure.findFirst({
    where: { OR: [{ id: term }, { slug: term }] },
    select: { id: true, slug: true, title: true }
  });
}

export async function updateProcedure(idOrSlug: string, input: ProcedureInput): Promise<ProcedureDetail> {
  const existing = await resolveId(idOrSlug);
  if (!existing) throw new ProcedureNotFoundError("Procedimento não encontrado.");

  const data = normalizeInput(input, true);

  // Recalcula slug se o título mudou e ainda não havia slug.
  if (typeof data.title === "string" && (!existing.slug || data.title !== existing.title)) {
    data.slug = await ensureUniqueSlug(slugify(data.title), existing.id);
  }

  await prisma.procedure.update({ where: { id: existing.id }, data });
  const detail = await getProcedureBySlug(existing.id);
  if (!detail) throw new ProcedureNotFoundError("Procedimento não encontrado após atualização.");
  return detail;
}

export async function deleteProcedure(idOrSlug: string): Promise<void> {
  const existing = await resolveId(idOrSlug);
  if (!existing) throw new ProcedureNotFoundError("Procedimento não encontrado.");
  try {
    await prisma.procedure.delete({ where: { id: existing.id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ProcedureNotFoundError("Procedimento não encontrado.");
    }
    throw error;
  }
}

export async function incrementProcedureView(idOrSlug: string): Promise<void> {
  try {
    await prisma.procedure.updateMany({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      data: { viewCount: { increment: 1 } }
    });
  } catch {
    // Contador é best-effort — nunca quebra a renderização da página de detalhe.
  }
}

import { Prisma, ImportStatus, ImportType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_MODULE_LABELS,
  IMPORT_STATUS_LABELS,
  IMPORT_TYPE_LABELS,
  type AuditLogDTO,
  type AuditLogFilters,
  type ImportHistoryDTO,
  type ImportHistoryFilters,
  type LastImportInfo,
  type SystemTechnicalStatus
} from "@/types/audit";

/* -------------------------------------------------------------------------- */
/*  Sanitização — TAREFA 7: nunca persistir/expor dados sensíveis             */
/* -------------------------------------------------------------------------- */

/** Padrões de chaves cujo VALOR jamais pode ser gravado em `details`. */
const SENSITIVE_KEY_PATTERN =
  /(pass|senha|hash|token|secret|connection|database_?url|datasource|\.env|credential|authorization|cookie|apikey|api_key|bearer)/i;

const REDACTED = "[oculto]";

/**
 * Remove recursivamente quaisquer valores sob chaves sensíveis. Mantém a forma
 * do objeto (substitui o valor por "[oculto]") para preservar a auditoria sem
 * vazar segredo. Limita profundidade para evitar estruturas patológicas.
 */
function sanitizeDetails(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map((item) => sanitizeDetails(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeDetails(val, depth + 1);
    }
    return out;
  }
  return value;
}

/** Mensagem de erro segura para exibição (trunca e remove possíveis URLs com credencial). */
function safeMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const noCreds = message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[conexão oculta]");
  return noCreds.length > 500 ? `${noCreds.slice(0, 500)}…` : noCreds;
}

/* -------------------------------------------------------------------------- */
/*  Auditoria administrativa                                                  */
/* -------------------------------------------------------------------------- */

export type CreateAuditLogInput = {
  action: string;
  module: string;
  userId?: string | null;
  userName?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

/**
 * Registra uma ação na trilha de auditoria. BEST-EFFORT: nunca lança — uma
 * falha de auditoria JAMAIS pode quebrar o fluxo crítico (login, importação…).
 */
export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  try {
    const details =
      input.details === null || input.details === undefined
        ? undefined
        : (sanitizeDetails(input.details) as Prisma.InputJsonValue);

    await prisma.auditLog.create({
      data: {
        action: input.action,
        module: input.module,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        entityId: input.entityId ?? null,
        entityName: input.entityName ?? null,
        ipAddress: input.ipAddress ?? null,
        ...(details === undefined ? {} : { details })
      }
    });
  } catch (error) {
    console.error("[audit] Falha ao registrar auditoria (ignorado).", error instanceof Error ? error.message : error);
  }
}

function toAuditDTO(row: {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  module: string;
  entityId: string | null;
  entityName: string | null;
  details: Prisma.JsonValue | null;
  ipAddress: string | null;
  createdAt: Date;
}): AuditLogDTO {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    action: row.action,
    actionLabel: AUDIT_ACTION_LABELS[row.action] ?? row.action,
    module: row.module,
    moduleLabel: AUDIT_MODULE_LABELS[row.module] ?? row.module,
    entityId: row.entityId,
    entityName: row.entityName,
    details: (row.details as Record<string, unknown> | null) ?? null,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString()
  };
}

export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogDTO[]> {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = new Date(filters.from);
    if (filters.to) where.createdAt.lte = new Date(filters.to);
  }
  if (filters.module) where.module = filters.module;
  if (filters.action) where.action = filters.action;
  if (filters.user) {
    where.OR = [
      { userName: { contains: filters.user, mode: "insensitive" } },
      { userId: { contains: filters.user, mode: "insensitive" } }
    ];
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit ?? 200, 1000)
  });
  return rows.map(toAuditDTO);
}

/* -------------------------------------------------------------------------- */
/*  Histórico de importações (sobre o model ImportHistory existente)          */
/* -------------------------------------------------------------------------- */

function toImportDTO(row: {
  id: string;
  type: ImportType;
  fileName: string;
  importedBy: string | null;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  errorRows: number;
  status: ImportStatus;
  errorMessage: string | null;
  createdAt: Date;
}): ImportHistoryDTO {
  return {
    id: row.id,
    type: row.type,
    moduleLabel: IMPORT_TYPE_LABELS[row.type] ?? row.type,
    fileName: row.fileName,
    importedBy: row.importedBy,
    totalRows: row.totalRows,
    createdRows: row.createdRows,
    updatedRows: row.updatedRows,
    errorRows: row.errorRows,
    status: row.status,
    statusLabel: IMPORT_STATUS_LABELS[row.status] ?? row.status,
    errorMessage: safeMessage(row.errorMessage),
    createdAt: row.createdAt.toISOString()
  };
}

export async function getImportHistory(filters: ImportHistoryFilters = {}): Promise<ImportHistoryDTO[]> {
  const where: Prisma.ImportHistoryWhereInput = {};

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = new Date(filters.from);
    if (filters.to) where.createdAt.lte = new Date(filters.to);
  }
  if (filters.type && filters.type in ImportType) where.type = filters.type as ImportType;
  if (filters.status && filters.status in ImportStatus) where.status = filters.status as ImportStatus;

  const rows = await prisma.importHistory.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit ?? 200, 1000)
  });
  return rows.map(toImportDTO);
}

/**
 * Cria um registro de histórico de importação. Disponibilizado no service para
 * uso futuro/programático — os importadores existentes (PC-Factory, OS, Compras,
 * Lubrificantes) já gravam o próprio histórico e NÃO foram alterados.
 * BEST-EFFORT: não lança (o log nunca impede a importação crítica).
 */
export async function createImportHistory(data: {
  type: ImportType;
  fileName: string;
  importedBy?: string | null;
  totalRows?: number;
  createdRows?: number;
  updatedRows?: number;
  errorRows?: number;
  status: ImportStatus;
  errorMessage?: string | null;
}): Promise<{ id: string } | null> {
  try {
    const row = await prisma.importHistory.create({
      data: {
        type: data.type,
        fileName: data.fileName,
        importedBy: data.importedBy ?? null,
        totalRows: data.totalRows ?? 0,
        createdRows: data.createdRows ?? 0,
        updatedRows: data.updatedRows ?? 0,
        errorRows: data.errorRows ?? 0,
        status: data.status,
        errorMessage: data.errorMessage ?? null
      },
      select: { id: true }
    });
    return row;
  } catch (error) {
    console.error("[audit] Falha ao criar histórico de importação (ignorado).", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Atualiza um registro de histórico de importação. BEST-EFFORT. */
export async function updateImportHistory(
  id: string,
  data: Partial<{
    totalRows: number;
    createdRows: number;
    updatedRows: number;
    errorRows: number;
    status: ImportStatus;
    errorMessage: string | null;
  }>
): Promise<void> {
  try {
    await prisma.importHistory.update({ where: { id }, data });
  } catch (error) {
    console.error("[audit] Falha ao atualizar histórico de importação (ignorado).", error instanceof Error ? error.message : error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Status técnico do sistema (sempre seguro — TAREFA 3/7)                     */
/* -------------------------------------------------------------------------- */

const STATUS_IMPORT_TYPES: ImportType[] = [ImportType.PC_FACTORY, ImportType.ORDENS_SERVICO, ImportType.COMPRAS];

export async function getSystemTechnicalStatus(): Promise<SystemTechnicalStatus> {
  // 1) Conectividade do banco — ping leve, sem expor a connection string.
  let database: SystemTechnicalStatus["database"] = "desconectado";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "conectado";
  } catch {
    database = "desconectado";
  }

  // 2) Autenticação ativa = AUTH_SECRET configurado (presença, nunca o valor).
  const secret = process.env.AUTH_SECRET ?? "";
  const auth: SystemTechnicalStatus["auth"] = secret.length >= 16 ? "ativa" : "inativa";

  // 3) Ambiente de deploy (apenas o rótulo).
  const deploy = process.env.VERCEL === "1" || process.env.VERCEL === "true" ? "Vercel" : "Local";

  // 4) Última importação por módulo de interesse + último erro.
  let lastImports: LastImportInfo[] = STATUS_IMPORT_TYPES.map((type) => ({
    type,
    moduleLabel: IMPORT_TYPE_LABELS[type] ?? type,
    fileName: null,
    status: null,
    statusLabel: null,
    at: null
  }));
  let lastError: SystemTechnicalStatus["lastError"] = null;

  if (database === "conectado") {
    try {
      const [imports, errorRow] = await Promise.all([
        Promise.all(
          STATUS_IMPORT_TYPES.map((type) =>
            prisma.importHistory.findFirst({ where: { type }, orderBy: { createdAt: "desc" } })
          )
        ),
        prisma.importHistory.findFirst({ where: { status: ImportStatus.ERRO }, orderBy: { createdAt: "desc" } })
      ]);

      lastImports = STATUS_IMPORT_TYPES.map((type, i) => {
        const row = imports[i];
        return {
          type,
          moduleLabel: IMPORT_TYPE_LABELS[type] ?? type,
          fileName: row?.fileName ?? null,
          status: row?.status ?? null,
          statusLabel: row ? IMPORT_STATUS_LABELS[row.status] ?? row.status : null,
          at: row?.createdAt.toISOString() ?? null
        };
      });

      if (errorRow) {
        lastError = {
          moduleLabel: IMPORT_TYPE_LABELS[errorRow.type] ?? errorRow.type,
          message: safeMessage(errorRow.errorMessage) ?? "Erro de importação (sem detalhes).",
          at: errorRow.createdAt.toISOString()
        };
      }
    } catch (error) {
      console.error("[audit] Falha ao calcular status técnico.", error instanceof Error ? error.message : error);
    }
  }

  return { database, auth, deploy, lastImports, lastError };
}

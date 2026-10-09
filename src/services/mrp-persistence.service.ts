/**
 * ANÁLISE MRP — persistência transacional (FASE B).
 *
 * Única mudança arquitetural autorizada em relação ao HTML de referência: o HTML
 * gravava a base nova no localStorage ANTES de validar o estoque; aqui toda
 * troca de "vigente" é atômica — se qualquer etapa falhar, a versão/análise
 * anterior continua valendo. Regras de cálculo NÃO moram aqui.
 *
 * Invariantes (também garantidas no banco por índices únicos parciais, ver
 * prisma/migrations/20261007000100_add_mrp_analysis_tables):
 *   - no máximo UMA MrpBaseVersion com isActive = true;
 *   - no máximo UMA MrpAnalysisRun com isCurrent = true;
 *   - uma versão só é ativada se estiver COMPLETA (materiais gravados = materialCount).
 *
 * Sem react.cache: usável em rotas, server actions e scripts.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SETTINGS } from "@/constants/portal-settings-defaults";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Converte uma quantidade (Number do JS, como o parseNum do HTML produz) para o
 * Decimal gravado no banco SEM perder bits. OBRIGATÓRIO em toda gravação de
 * quantidade MRP: passar o `number` cru ao Prisma corta o valor em 15 dígitos
 * (0.30000000000000004 -> 0.3). Prisma.Decimal(v) usa o texto shortest
 * round-trip do JS, então `toNumber()` na leitura devolve o MESMO double.
 * Única perda conhecida: -0 vira 0 (o numeric não tem -0).
 */
export function toMrpDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** Leitura simétrica de toMrpDecimal (null preservado). */
export function fromMrpDecimal(value: Prisma.Decimal): number;
export function fromMrpDecimal(value: Prisma.Decimal | null): number | null;
export function fromMrpDecimal(value: Prisma.Decimal | null): number | null {
  return value == null ? null : value.toNumber();
}

export const MRP_BASE_SOURCES = ["SEED_HTML", "UPLOAD"] as const;
export type MrpBaseSource = (typeof MRP_BASE_SOURCES)[number];

export const MRP_RUN_TRIGGERS = ["FULL_UPDATE", "BASE_REIMPORT", "BASE_RESTORE"] as const;
export type MrpRunTrigger = (typeof MRP_RUN_TRIGGERS)[number];

/** Lote do createMany — evita uma instrução gigante e mantém a transação curta. */
const INSERT_CHUNK = 1000;
/** Bases de ~4–5 mil materiais: folga para a inserção em lotes dentro da transação. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

export class MrpPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MrpPersistenceError";
  }
}

export type MrpBaseMaterialInput = {
  code: string;
  description: string;
  group: string;
  unit: string;
  min: number;
  max: number;
  statusMrp: string;
  family: string;
  area: string;
  sourceSheet?: string | null;
  sourceRow?: number | null;
};

export type CreateMrpBaseVersionInput = {
  fileName: string;
  source: MrpBaseSource;
  sheets: Prisma.InputJsonValue;
  ignoredSheets: Prisma.InputJsonValue;
  defaultArea: string;
  materials: MrpBaseMaterialInput[];
  metadata?: Prisma.InputJsonValue;
  createdBy?: string | null;
  importHistoryId?: string | null;
  /** true = ativa a versão na MESMA transação (desativando a anterior). */
  activate: boolean;
};

async function inTransaction<T>(client: Db | undefined, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  // Já dentro de uma transação do chamador: participa dela (rollback conjunto).
  if (client && !("$transaction" in client)) return fn(client);
  const root = (client as PrismaClient | undefined) ?? prisma;
  return root.$transaction(fn, TX_OPTIONS);
}

/**
 * Cria uma versão da Base MRP com todos os materiais e, se pedido, ativa-a —
 * tudo numa transação. Códigos repetidos são rejeitados pelo unique
 * (versionId, code): a deduplicação do HTML deve ser aplicada ANTES.
 */
export async function createMrpBaseVersion(input: CreateMrpBaseVersionInput, client?: Db) {
  if (!input.materials.length) {
    throw new MrpPersistenceError("Base MRP sem materiais — nada a gravar.");
  }
  return inTransaction(client, async (tx) => {
    const version = await tx.mrpBaseVersion.create({
      data: {
        fileName: input.fileName,
        source: input.source,
        sheets: input.sheets,
        ignoredSheets: input.ignoredSheets,
        defaultArea: input.defaultArea,
        materialCount: input.materials.length,
        metadata: input.metadata,
        createdBy: input.createdBy ?? null,
        importHistoryId: input.importHistoryId ?? null
      }
    });

    for (let i = 0; i < input.materials.length; i += INSERT_CHUNK) {
      await tx.mrpBaseMaterial.createMany({
        data: input.materials.slice(i, i + INSERT_CHUNK).map((m) => ({
          versionId: version.id,
          code: m.code,
          description: m.description,
          group: m.group,
          unit: m.unit,
          min: toMrpDecimal(m.min),
          max: toMrpDecimal(m.max),
          statusMrp: m.statusMrp,
          family: m.family,
          area: m.area,
          sourceSheet: m.sourceSheet ?? null,
          sourceRow: m.sourceRow ?? null
        }))
      });
    }

    return input.activate ? activateMrpBaseVersion(version.id, tx) : version;
  });
}

/**
 * Torna `versionId` a única versão ativa: desativa a anterior e ativa a nova na
 * mesma transação. Se qualquer passo falhar (versão inexistente/incompleta,
 * concorrência barrada pelo índice único parcial, erro do banco), nada muda e
 * a versão anterior continua ativa — nunca fica zero versões ativas.
 */
export async function activateMrpBaseVersion(versionId: string, client?: Db) {
  return inTransaction(client, async (tx) => {
    const target = await tx.mrpBaseVersion.findUnique({
      where: { id: versionId },
      select: { id: true, isActive: true, materialCount: true, _count: { select: { materials: true } } }
    });
    if (!target) {
      throw new MrpPersistenceError(`Versão da Base MRP não encontrada: ${versionId}`);
    }
    if (target._count.materials === 0 || target._count.materials !== target.materialCount) {
      throw new MrpPersistenceError(
        `Versão ${versionId} incompleta (${target._count.materials} de ${target.materialCount} materiais) — não pode ser ativada.`
      );
    }

    const now = new Date();
    if (!target.isActive) {
      // Ordem obrigatória: desativar antes de ativar (índice único parcial).
      await tx.mrpBaseVersion.updateMany({
        where: { isActive: true, NOT: { id: versionId } },
        data: { isActive: false, deactivatedAt: now }
      });
      await tx.mrpBaseVersion.update({
        where: { id: versionId },
        data: { isActive: true, activatedAt: now, deactivatedAt: null }
      });
    }

    const active = await tx.mrpBaseVersion.count({ where: { isActive: true } });
    if (active !== 1) {
      throw new MrpPersistenceError(`Ativação inconsistente: ${active} versões ativas.`);
    }
    return tx.mrpBaseVersion.findUniqueOrThrow({ where: { id: versionId } });
  });
}

/** Versão vigente da Base MRP (ou null antes da primeira carga). */
export async function getActiveMrpBaseVersion(client: Db = prisma) {
  return client.mrpBaseVersion.findFirst({ where: { isActive: true } });
}

/**
 * Torna `runId` a única análise current (mesma mecânica da Base MRP). Uma
 * execução que falhar antes daqui nunca substitui a análise vigente.
 */
export async function setCurrentMrpAnalysisRun(runId: string, client?: Db) {
  return inTransaction(client, async (tx) => {
    const target = await tx.mrpAnalysisRun.findUnique({ where: { id: runId }, select: { id: true, isCurrent: true } });
    if (!target) {
      throw new MrpPersistenceError(`Análise MRP não encontrada: ${runId}`);
    }
    if (!target.isCurrent) {
      await tx.mrpAnalysisRun.updateMany({ where: { isCurrent: true, NOT: { id: runId } }, data: { isCurrent: false } });
      await tx.mrpAnalysisRun.update({ where: { id: runId }, data: { isCurrent: true } });
    }
    const current = await tx.mrpAnalysisRun.count({ where: { isCurrent: true } });
    if (current !== 1) {
      throw new MrpPersistenceError(`Troca de análise inconsistente: ${current} análises current.`);
    }
    return tx.mrpAnalysisRun.findUniqueOrThrow({ where: { id: runId } });
  });
}

/** Análise vigente (ou null antes da primeira execução). */
export async function getCurrentMrpAnalysisRun(client: Db = prisma) {
  return client.mrpAnalysisRun.findFirst({ where: { isCurrent: true } });
}

const FALLBACK_DEPOSIT = String(
  DEFAULT_SETTINGS.find((s) => s.category === "mrp" && s.key === "deposito_padrao")?.value ?? "1400"
);

/**
 * Depósito sugerido no filtro de estoque: PortalSetting mrp/deposito_padrao
 * (global; padrão "1400", como o campo fDep do HTML). Não existe hoje estrutura
 * de preferência por usuário no portal — o valor efetivamente usado em cada
 * análise fica em MrpAnalysisRun.depositFilter.
 */
export async function getMrpDefaultDeposit(client: Db = prisma): Promise<string> {
  const row = await client.portalSetting.findUnique({
    where: { category_key: { category: "mrp", key: "deposito_padrao" } },
    select: { value: true }
  });
  return typeof row?.value === "string" ? row.value : FALLBACK_DEPOSIT;
}

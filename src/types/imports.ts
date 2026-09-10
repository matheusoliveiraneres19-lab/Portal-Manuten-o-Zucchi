/**
 * Contrato compartilhado da infraestrutura de importação (Supabase Pro).
 *
 * Reúne, em um lugar só: os módulos importáveis, o ciclo de vida de uma
 * importação, o mapeamento para os enums Prisma que já existiam e o formato de
 * retorno padrão que todo importador deve devolver.
 *
 * COMPATIBILIDADE — leia antes de mexer
 * -------------------------------------
 * O portal já tinha `ImportStatus` (SUCESSO/PARCIAL/ERRO/EM_PROCESSAMENTO),
 * gravado pelos cinco importadores atuais e lido pela aba Configurações e pelo
 * card de status técnico. Esse enum NÃO muda.
 *
 * O ciclo de vida novo mora em `ImportHistory.stage` (texto livre, valores em
 * IMPORT_STAGES) e é escrito só pelo orquestrador, que espelha `stage` em
 * `status` via STAGE_TO_STATUS. Assim a tela antiga continua correta sem saber
 * que o staging existe.
 */
import { ImportStatus, ImportType } from "@prisma/client";

/* -------------------------------------------------------------------------- */
/*  Módulos importáveis                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Módulos cobertos pela infra de importação. São exatamente valores de
 * `ImportType` (Prisma) — o alias existe para o código de importação falar
 * "módulo" e não depender do enum em toda assinatura.
 */
export const IMPORT_MODULES = {
  PC_FACTORY: ImportType.PC_FACTORY,
  COMPRAS: ImportType.COMPRAS,
  ORDENS_SERVICO: ImportType.ORDENS_SERVICO,
  LUBRIFICANTES: ImportType.LUBRIFICANTES,
  LOCAL_INSTALACAO: ImportType.LOCAL_INSTALACAO,
  PROCEDIMENTOS: ImportType.PROCEDIMENTOS
} as const;

export type ImportModule = (typeof IMPORT_MODULES)[keyof typeof IMPORT_MODULES];

/** Pasta de cada módulo dentro do bucket. Kebab-case, estável — NÃO renomear:
 *  o caminho já gravado em ImportHistory.filePath aponta para ela. */
export const IMPORT_MODULE_SLUGS: Record<ImportModule, string> = {
  [ImportType.PC_FACTORY]: "pc-factory",
  [ImportType.COMPRAS]: "compras",
  [ImportType.ORDENS_SERVICO]: "ordens-servico",
  [ImportType.LUBRIFICANTES]: "lubrificantes",
  [ImportType.LOCAL_INSTALACAO]: "local-instalacao",
  [ImportType.PROCEDIMENTOS]: "procedimentos"
};

/** true quando o valor é um módulo coberto pela infra de Storage/staging. */
export function isImportModule(value: unknown): value is ImportModule {
  return typeof value === "string" && Object.values(IMPORT_MODULES).includes(value as ImportModule);
}

/* -------------------------------------------------------------------------- */
/*  Ciclo de vida (ImportHistory.stage)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Estados de uma importação, na ordem em que acontecem:
 *
 *   UPLOADED    arquivo salvo no Storage, nada foi lido ainda
 *   VALIDATING  linhas no staging, validação em curso
 *   PROCESSING  validação OK, gravando na base oficial
 *   COMPLETED   base oficial atualizada
 *   FAILED      abortada — a base oficial NÃO foi tocada
 *   CANCELLED   interrompida pelo operador
 */
export const IMPORT_STAGES = {
  UPLOADED: "UPLOADED",
  VALIDATING: "VALIDATING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED"
} as const;

export type ImportStage = (typeof IMPORT_STAGES)[keyof typeof IMPORT_STAGES];

/** Reexportado de @/types/audit — lá o módulo é seguro para Client Components. */
export { IMPORT_STAGE_LABELS, IMPORT_ROW_STATUS_LABELS } from "@/types/audit";

/** true quando o estágio é final (nada mais vai mudar nesta importação). */
export function isTerminalStage(stage: string | null | undefined): boolean {
  return stage === IMPORT_STAGES.COMPLETED || stage === IMPORT_STAGES.FAILED || stage === IMPORT_STAGES.CANCELLED;
}

/**
 * Espelho `stage` → `status` (enum legado). Mantém a aba Configurações e o card
 * de status técnico corretos sem que eles precisem conhecer o staging.
 *
 * COMPLETED cai em SUCESSO por padrão; o orquestrador rebaixa para PARCIAL
 * quando a importação terminou com linhas em erro (ver resolveLegacyStatus).
 */
export const STAGE_TO_STATUS: Record<ImportStage, ImportStatus> = {
  UPLOADED: ImportStatus.EM_PROCESSAMENTO,
  VALIDATING: ImportStatus.EM_PROCESSAMENTO,
  PROCESSING: ImportStatus.EM_PROCESSAMENTO,
  COMPLETED: ImportStatus.SUCESSO,
  FAILED: ImportStatus.ERRO,
  CANCELLED: ImportStatus.ERRO
};

/**
 * Status legado correspondente a um estágio, considerando os contadores.
 * "Concluída com erros em algumas linhas" é PARCIAL, não SUCESSO — é assim que
 * os importadores atuais já classificam, e a UI colore o badge com base nisso.
 */
export function resolveLegacyStatus(
  stage: ImportStage,
  counts?: { errorRows?: number; validRows?: number }
): ImportStatus {
  if (stage !== IMPORT_STAGES.COMPLETED) return STAGE_TO_STATUS[stage];
  const errorRows = counts?.errorRows ?? 0;
  if (errorRows === 0) return ImportStatus.SUCESSO;
  return (counts?.validRows ?? 0) > 0 ? ImportStatus.PARCIAL : ImportStatus.ERRO;
}

/* -------------------------------------------------------------------------- */
/*  Status de uma LINHA no staging (ImportStagingRow.status)                   */
/* -------------------------------------------------------------------------- */

/**
 *   PENDING   gravada, ainda não validada
 *   VALID     validada — pode ir para a base oficial
 *   IGNORED   descartada por regra de negócio (não é erro)
 *   INVALID   reprovada na validação
 *   APPLIED   já gravada na base oficial
 */
export const IMPORT_ROW_STATUSES = {
  PENDING: "PENDING",
  VALID: "VALID",
  IGNORED: "IGNORED",
  INVALID: "INVALID",
  APPLIED: "APPLIED"
} as const;

export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[keyof typeof IMPORT_ROW_STATUSES];

/* -------------------------------------------------------------------------- */
/*  Lotes (FASE 8)                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Tamanho padrão do lote de gravação.
 *
 * 500 é o ponto de equilíbrio medido para o Supabase via pgbouncer: lotes
 * menores multiplicam round-trips (dominante na latência); lotes muito maiores
 * incham o payload de um único INSERT e aumentam o tempo em que a transação
 * segura a conexão — escasso em serverless com `connection_limit=1`.
 */
export const DEFAULT_IMPORT_BATCH_SIZE = 500;

/** Faixa recomendada para importadores que queiram ajustar o lote. */
export const MIN_IMPORT_BATCH_SIZE = 100;
export const MAX_IMPORT_BATCH_SIZE = 1000;

/** Quebra um array em lotes de tamanho fixo, sem copiar o array inteiro antes. */
export function chunk<T>(items: readonly T[], size: number = DEFAULT_IMPORT_BATCH_SIZE): T[][] {
  const safeSize = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    out.push(items.slice(i, i + safeSize) as T[]);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Retorno padrão de um importador                                            */
/* -------------------------------------------------------------------------- */

/**
 * Formato de retorno que todo importador novo deve devolver (FASE 8).
 *
 * Os importadores ATUAIS ainda devolvem os próprios formatos e não foram
 * alterados — este tipo vale para o que for construído sobre o orquestrador.
 */
export type ImportResult = {
  success: boolean;
  importId: string;
  module: ImportModule;
  status: ImportStage;
  totalRows: number;
  validRows: number;
  ignoredRows: number;
  failedRows: number;
  message: string;
};

/** Contadores de um lote/execução, usados para fechar o histórico. */
export type ImportSummary = {
  totalRows?: number;
  validRows?: number;
  ignoredRows?: number;
  failedRows?: number;
  createdRows?: number;
  updatedRows?: number;
  message?: string;
  metadata?: Record<string, unknown>;
};

/** Uma linha crua a ser gravada no staging. */
export type StagingRowInput = {
  /** Número da linha na planilha (1-based) — é o que o usuário enxerga no Excel. */
  rowNumber: number;
  raw: Record<string, unknown>;
  normalized?: Record<string, unknown> | null;
  status?: ImportRowStatus;
  errorMessage?: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Storage                                                                    */
/* -------------------------------------------------------------------------- */

/** Bucket PRIVADO dos arquivos importados. Sobrescrevível por env. */
export const DEFAULT_IMPORTS_BUCKET = "portal-imports";

export function getImportsBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET_IMPORTS || DEFAULT_IMPORTS_BUCKET;
}

/** Extensões aceitas em qualquer importação de planilha. */
export const ALLOWED_IMPORT_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;

export const IMPORT_CONTENT_TYPES: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv"
};

/**
 * Teto padrão do arquivo importado: 25 MB.
 *
 * Não é o limite da função serverless (a Vercel corta o CORPO em ~4,5 MB) — é o
 * teto do objeto no Storage, para o upload DIRETO navegador → Supabase, que é o
 * caminho que planilhas grandes precisam usar. Ajustável por env sem deploy.
 */
export const DEFAULT_MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export function getMaxImportBytes(): number {
  const raw = Number(process.env.SUPABASE_IMPORT_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_IMPORT_BYTES;
}

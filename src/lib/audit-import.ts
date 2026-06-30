import type { NextRequest } from "next/server";
import type { SessionPayload } from "@/lib/session";
import { createAuditLog } from "@/services/audit.service";
import { getClientIp } from "@/lib/request-ip";
import { AUDIT_ACTIONS, AUDIT_MODULES } from "@/types/audit";

/** Campos numéricos comuns aos diferentes resultados de importação. */
const COUNT_FIELDS = [
  "totalRows",
  "createdRows",
  "updatedRows",
  "errorRows",
  "importedRows",
  "ignoredRows",
  "createdMovements"
] as const;

function extractCounts(result: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    for (const field of COUNT_FIELDS) {
      if (typeof r[field] === "number") out[field] = r[field] as number;
    }
  }
  return out;
}

/**
 * Registra a auditoria de uma importação de planilha (sucesso ou erro). É um
 * complemento ao histórico de importações — que continua sendo gravado pelos
 * próprios services. BEST-EFFORT (createAuditLog nunca lança).
 */
export async function auditImport(params: {
  request: NextRequest;
  session: SessionPayload | null;
  module: string;
  fileName: string;
  result?: unknown;
  error?: string;
}): Promise<void> {
  const { request, session, module, fileName, result, error } = params;
  await createAuditLog({
    action: error ? AUDIT_ACTIONS.ERRO_IMPORTACAO : AUDIT_ACTIONS.IMPORTAR_PLANILHA,
    module: AUDIT_MODULES.IMPORTACAO,
    userId: session?.sub ?? null,
    userName: session?.name ?? null,
    entityName: fileName,
    ipAddress: getClientIp(request),
    details: error ? { module, fileName, error } : { module, fileName, ...extractCounts(result) }
  });
}

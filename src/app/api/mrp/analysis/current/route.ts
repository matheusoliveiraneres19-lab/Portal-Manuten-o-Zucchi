/**
 * GET /api/mrp/analysis/current
 *
 * Análise MRP vigente: id do run, KPIs, fontes (base, estoque, compras), data e
 * autor. NÃO devolve os ~4 mil itens — as telas buscarão os itens filtrados.
 *
 * Leitura: qualquer usuário autenticado (política atual de visualização do
 * portal). Executar/importar continua restrito a ADMIN e GESTOR.
 */
import { requireApiSession } from "@/lib/auth-guard";
import { errorMessage, ok, serverError } from "@/lib/api-response";
import { getCurrentMrpAnalysisSummary } from "@/services/mrp-analysis.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  try {
    return ok({ current: await getCurrentMrpAnalysisSummary() });
  } catch (error) {
    return serverError("Não foi possível consultar a análise MRP vigente.", errorMessage(error));
  }
}

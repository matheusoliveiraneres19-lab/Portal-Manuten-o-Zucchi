/**
 * GET /api/mrp/export — exportações Excel da Análise MRP (FASE J).
 *
 * Query: type = buy | buy-by-area | families | idle | transit | base
 *   buy / buy-by-area: q, status, area, family, sort (filtros da aba Comprar)
 *   idle:              idleQ, idleType, idleArea
 *   base:              baseQ, baseArea, baseFilter
 *   families / transit: sem filtros (como o HTML).
 *
 * Sempre o run vigente (nunca um runId do cliente); a base é a mesma da aba
 * Base MRP. Leitura: qualquer usuário autenticado. Resposta: o .xlsx com o nome
 * em Content-Disposition, ou JSON { ok: false, message } quando não há o que exportar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { badRequest, errorMessage, serverError } from "@/lib/api-response";
import { parseMrpBuyFilters } from "@/lib/mrp/buy-list";
import { parseMrpIdleFilters } from "@/lib/mrp/idle";
import { parseMrpBaseViewFilters } from "@/lib/mrp/base-view";
import { isMrpExportType } from "@/lib/mrp/export";
import { MRP_XLSX_MIME } from "@/lib/mrp/export-workbook";
import { exportMrp } from "@/services/mrp-export.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;
  const sp = request.nextUrl.searchParams;
  const type = sp.get("type");
  if (!isMrpExportType(type)) return badRequest("Tipo de exportação inválido.", `type=${String(type)}`);
  try {
    const get = (k: string) => sp.get(k);
    const file = await exportMrp(type, { buy: parseMrpBuyFilters(get), idle: parseMrpIdleFilters(get), base: parseMrpBaseViewFilters(get) });
    if (!file.ok) return NextResponse.json({ ok: false, message: file.message }, { status: 422 });
    console.info(`[MRP_EXPORT] tipo=${type} arquivo=${file.fileName} abas=${file.sheets.join("|")} linhas=${file.rows} bytes=${file.data.length} consultas=${file.queries} ${file.ms}ms`);
    return new NextResponse(new Uint8Array(file.data), {
      status: 200,
      headers: {
        "content-type": MRP_XLSX_MIME,
        "content-disposition": `attachment; filename="${file.fileName}"`,
        "content-length": String(file.data.length),
        "cache-control": "no-store"
      }
    });
  } catch (err) {
    return serverError("Não foi possível gerar o Excel.", errorMessage(err));
  }
}

/**
 * GET /api/service-orders/search?query=&machine=&dateFrom=&dateTo=&scope=machine|all&limit=
 *
 * Autocomplete de Ordens de Serviço — hoje usado pela justificativa de baixa
 * disponibilidade do PC-Factory. Nunca devolve a base: no máximo 20 OS por
 * chamada, consolidadas por número (uma OS = uma sugestão, mesmo com várias
 * operações). `machine` e o período só PRIORIZAM; `scope=all` busca em todas.
 *
 * Leitura: qualquer usuário autenticado (as OS já são visíveis na aba Ordens de
 * Serviço para todos). A escrita do vínculo continua restrita na rota das
 * justificativas.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { searchServiceOrders } from "@/services/service-order-lookup.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  const sp = request.nextUrl.searchParams;
  const limit = Number(sp.get("limit"));

  try {
    const result = await searchServiceOrders({
      query: sp.get("query")?.slice(0, 60) ?? "",
      machine: sp.get("machine")?.slice(0, 120) ?? undefined,
      dateFrom: sp.get("dateFrom") ?? undefined,
      dateTo: sp.get("dateTo") ?? undefined,
      scope: sp.get("scope") === "all" ? "all" : "machine",
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    console.error("[service-orders/search] Falha na busca de OS.", caught);
    return NextResponse.json({ ok: false, message: "Não foi possível buscar as Ordens de Serviço." }, { status: 500 });
  }
}

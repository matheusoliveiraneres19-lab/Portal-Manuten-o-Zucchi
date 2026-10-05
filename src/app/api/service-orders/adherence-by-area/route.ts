/**
 * GET /api/service-orders/adherence-by-area?area=MEC&<filtros da aba>
 *
 * Detalhe do gráfico "Aderência de execução por área": OS ainda não encerradas da
 * área clicada, sob os MESMOS filtros da página. Os filtros chegam na mesma query
 * string da URL da aba e são lidos pelo mesmo parser, para o detalhe nunca falar de
 * um recorte diferente do gráfico.
 *
 * Só é chamado no clique — a página carrega sem esta consulta.
 *
 * Autenticação: a existente do portal (`requireApiSession`), sem restrição de
 * papel — é o mesmo critério da própria aba Ordens de Serviço.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { getOpenServiceOrdersByArea } from "@/services/service-orders.service";
import { PLANNING_GROUP_ORDER, type PlanningGroupKey } from "@/utils/service-order-planning";
import {
  parseAppliedServiceOrderFilters,
  searchParamsToRecord,
  toServiceOrderQueryParams
} from "@/utils/service-order-query-params";

export const dynamic = "force-dynamic";

function isPlanningGroupKey(value: string | null): value is PlanningGroupKey {
  return Boolean(value) && PLANNING_GROUP_ORDER.includes(value as PlanningGroupKey);
}

export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  const area = request.nextUrl.searchParams.get("area");
  if (!isPlanningGroupKey(area)) {
    return NextResponse.json(
      { ok: false, message: `Informe 'area' como uma de: ${PLANNING_GROUP_ORDER.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    const record = searchParamsToRecord(request.nextUrl.searchParams);
    const params = toServiceOrderQueryParams(parseAppliedServiceOrderFilters(record), record);
    const data = await getOpenServiceOrdersByArea(params, area);
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    console.error("Falha ao carregar o detalhe de aderência por área.", caught);
    return NextResponse.json({ ok: false, message: "Falha ao carregar as OS abertas da área." }, { status: 500 });
  }
}

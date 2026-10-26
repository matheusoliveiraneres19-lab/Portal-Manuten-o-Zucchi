/**
 * GET /api/service-orders/adherence-by-area?area=MEC&status=open&type=corrective&<filtros da aba>
 *
 * Detalhe do painel "Aderência de execução por área": as ORDENS da área clicada sob
 * os MESMOS filtros da página, filtradas por status (all | open | closed — padrão
 * open) e classificação (all | corrective | planned — padrão all). Os filtros da aba
 * chegam na mesma query string da URL e são lidos pelo mesmo parser, para o detalhe
 * nunca falar de um recorte diferente do painel.
 *
 * Só é chamado no clique — a página carrega sem esta consulta.
 *
 * Autenticação: a existente do portal (`requireApiSession`), sem restrição de
 * papel — é o mesmo critério da própria aba Ordens de Serviço.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { getServiceOrdersByArea } from "@/services/service-orders.service";
import { PLANNING_GROUP_ORDER, type PlanningGroupKey } from "@/utils/service-order-planning";
import {
  parseAppliedServiceOrderFilters,
  searchParamsToRecord,
  toServiceOrderQueryParams
} from "@/utils/service-order-query-params";
import type { ServiceOrderAreaStatusFilter, ServiceOrderAreaTypeFilter } from "@/types/service-orders";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: ServiceOrderAreaStatusFilter[] = ["all", "open", "closed"];
const TYPE_FILTERS: ServiceOrderAreaTypeFilter[] = ["all", "corrective", "planned"];

function isPlanningGroupKey(value: string | null): value is PlanningGroupKey {
  return Boolean(value) && PLANNING_GROUP_ORDER.includes(value as PlanningGroupKey);
}

function pick<T extends string>(value: string | null, allowed: T[], fallback: T): T | null {
  if (value === null || value === "") return fallback;
  return allowed.includes(value as T) ? (value as T) : null;
}

export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  const search = request.nextUrl.searchParams;
  const area = search.get("area");
  // `status` já é um filtro da aba (status SAP); o do detalhe usa outro nome.
  const status = pick(search.get("detailStatus"), STATUS_FILTERS, "open");
  const type = pick(search.get("detailType"), TYPE_FILTERS, "all");

  if (!isPlanningGroupKey(area) || !status || !type) {
    return NextResponse.json(
      {
        ok: false,
        message: `Parâmetros inválidos: area ∈ {${PLANNING_GROUP_ORDER.join(", ")}}, detailStatus ∈ {${STATUS_FILTERS.join(", ")}}, detailType ∈ {${TYPE_FILTERS.join(", ")}}.`
      },
      { status: 400 }
    );
  }

  try {
    const record = searchParamsToRecord(search);
    const params = toServiceOrderQueryParams(parseAppliedServiceOrderFilters(record), record);
    const data = await getServiceOrdersByArea(params, area, { status, type });
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    console.error("Falha ao carregar o detalhe de aderência por área.", caught);
    return NextResponse.json({ ok: false, message: "Falha ao carregar as OS da área." }, { status: 500 });
  }
}

/**
 * GET /api/service-orders/equipment-analysis?equipment=<TAG da máquina>&<filtros da aba>
 *
 * Detalhe do painel "Análise de ordens por equipamento": a máquina clicada sob os
 * MESMOS filtros da página (período, status, grupo, responsável, objeto técnico,
 * área, busca). Os filtros chegam na mesma query string da URL da aba e são lidos
 * pelo mesmo parser — o drawer nunca analisa um recorte diferente do ranking.
 *
 * Devolve só o consolidado da máquina, não as ~20 mil OS da base. Chamado apenas no
 * clique. 404 quando a máquina não tem ordens no recorte: nunca há fallback para os
 * dados gerais.
 *
 * Autenticação: a existente do portal (`requireApiSession`), sem restrição de
 * papel — o mesmo critério da própria aba Ordens de Serviço.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { getServiceOrderEquipmentAnalysis } from "@/services/service-orders.service";
import {
  parseAppliedServiceOrderFilters,
  searchParamsToRecord,
  toServiceOrderQueryParams
} from "@/utils/service-order-query-params";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  const search = request.nextUrl.searchParams;
  // `equipment` já é o filtro "Objeto técnico" da aba; a máquina vem em `machine`.
  const machine = search.get("machine")?.trim();
  if (!machine) {
    return NextResponse.json({ ok: false, message: "Informe 'machine' (TAG da máquina)." }, { status: 400 });
  }

  try {
    const record = searchParamsToRecord(search);
    const params = toServiceOrderQueryParams(parseAppliedServiceOrderFilters(record), record);
    const data = await getServiceOrderEquipmentAnalysis(machine, params);
    if (!data) {
      return NextResponse.json(
        { ok: false, message: "Sem dados disponíveis para este equipamento no recorte atual." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    console.error("Falha ao carregar a análise do equipamento.", caught);
    return NextResponse.json({ ok: false, message: "Falha ao carregar a análise do equipamento." }, { status: 500 });
  }
}

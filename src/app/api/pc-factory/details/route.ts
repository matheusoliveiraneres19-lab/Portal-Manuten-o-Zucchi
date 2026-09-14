import { PcFactoryStatusCategory } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { getPcFactoryResourceDetails } from "@/services/pc-factory.service";
import { requireApiSession } from "@/lib/auth-guard";
import { PC_FACTORY_DEFAULT_MODE, type PcFactoryCalculationMode, type PcFactoryQueryParams } from "@/types/pc-factory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Defesa em profundidade: o middleware já bloqueia /api/* sem sessão, mas a
  // rota revalida por conta própria para não depender só do matcher.
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const search = request.nextUrl.searchParams;
    // A máquina clicada vem em `machine`, NÃO em `resource`: `resource` é o filtro de
    // máquina da tela (multi-seleção) e os dois viajam juntos nesta mesma query string.
    const machine = search.get("machine") ?? search.get("resource");
    if (!machine || !machine.trim()) {
      return NextResponse.json({ error: "Parâmetro 'machine' é obrigatório." }, { status: 400 });
    }

    // Os MESMOS filtros da tela, para o painel não mostrar outro período que a tabela.
    const details = await getPcFactoryResourceDetails(machine, parseFilters(search));
    if (!details) {
      return NextResponse.json({ error: "Recurso não encontrado." }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (error) {
    console.error("Falha ao carregar detalhes do recurso PC-Factory.", error);
    return NextResponse.json({ error: "Falha ao carregar detalhes." }, { status: 500 });
  }
}

/**
 * Lê da query string exatamente os mesmos parâmetros que a rota da página lê — mesmos
 * nomes, mesma semântica. É o que garante que tabela e painel falem do mesmo recorte.
 */
function parseFilters(search: URLSearchParams): PcFactoryQueryParams {
  const first = (key: string) => {
    const value = search.get(key);
    return value && value.trim() ? value.trim() : undefined;
  };
  const list = (key: string) => search.getAll(key).map((value) => value.trim()).filter(Boolean);
  const isTrue = (key: string) => first(key) === "1";
  const rawMode = first("mode");
  const mode: PcFactoryCalculationMode =
    rawMode === "INTERVALO_REAL" || rawMode === "G0134_OFICIAL" ? rawMode : PC_FACTORY_DEFAULT_MODE;

  return {
    startDate: first("startDate"),
    endDate: first("endDate"),
    productionLines: list("line"),
    groupPortals: list("group"),
    // O filtro de máquina da tela é sobrescrito pelo recurso clicado no service; entra
    // aqui só para manter a leitura simétrica com a rota da página.
    resources: list("resource"),
    sectors: list("sector"),
    shifts: list("shift"),
    statusNames: list("statusName"),
    categories: list("category").filter((value) => value in PcFactoryStatusCategory) as PcFactoryStatusCategory[],
    onlyMaintenance: isTrue("onlyMaintenance"),
    onlyMechanical: isTrue("onlyMechanical"),
    onlyElectrical: isTrue("onlyElectrical"),
    onlyAutomation: isTrue("onlyAutomation"),
    onlyWaiting: isTrue("onlyWaiting"),
    excludeOutOfPlanned: isTrue("excludeOutOfPlanned"),
    search: first("q"),
    mode
  };
}

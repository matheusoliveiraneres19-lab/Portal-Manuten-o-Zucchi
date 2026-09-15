import { NextResponse, type NextRequest } from "next/server";
import { getWorkforceMemberDetail } from "@/services/workforce.service";
import { requireApiSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Detalhe de um colaborador na visão de carga de trabalho.
 *
 * Recebe o período da tela (`startDate`/`endDate`) e o repassa ao service, para o
 * painel lateral responder pelo MESMO recorte da linha clicada.
 */
export async function GET(request: NextRequest) {
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const search = request.nextUrl.searchParams;
    const member = search.get("member");
    if (!member || !member.trim()) {
      return NextResponse.json({ error: "Parâmetro 'member' é obrigatório." }, { status: 400 });
    }

    const first = (key: string) => {
      const value = search.get(key);
      return value && value.trim() ? value.trim() : undefined;
    };

    const detail = await getWorkforceMemberDetail(member, {
      startDate: first("startDate"),
      endDate: first("endDate")
    });

    if (!detail) {
      return NextResponse.json({ error: "Colaborador sem ordens no período." }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error("Falha ao carregar detalhe do colaborador.", error);
    return NextResponse.json({ error: "Falha ao carregar detalhe." }, { status: 500 });
  }
}

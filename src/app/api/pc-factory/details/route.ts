import { NextResponse, type NextRequest } from "next/server";
import { getPcFactoryResourceDetails } from "@/services/pc-factory.service";
import { requireApiSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Defesa em profundidade: o middleware já bloqueia /api/* sem sessão, mas a
  // rota revalida por conta própria para não depender só do matcher.
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const resource = request.nextUrl.searchParams.get("resource");
    if (!resource || !resource.trim()) {
      return NextResponse.json({ error: "Parâmetro 'resource' é obrigatório." }, { status: 400 });
    }

    const details = await getPcFactoryResourceDetails(resource);
    if (!details) {
      return NextResponse.json({ error: "Recurso não encontrado." }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (error) {
    console.error("Falha ao carregar detalhes do recurso PC-Factory.", error);
    return NextResponse.json({ error: "Falha ao carregar detalhes." }, { status: 500 });
  }
}

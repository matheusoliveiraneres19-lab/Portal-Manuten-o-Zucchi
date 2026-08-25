import { NextResponse, type NextRequest } from "next/server";
import { getLubricantDetails } from "@/services/lubricants.service";
import { requireApiSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Defesa em profundidade: o middleware já bloqueia /api/* sem sessão, mas a
  // rota revalida por conta própria para não depender só do matcher.
  const { error } = await requireApiSession();
  if (error) return error;

  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Parâmetro 'code' é obrigatório." }, { status: 400 });
  }

  try {
    const details = await getLubricantDetails(code);
    if (!details) {
      return NextResponse.json({ error: "Lubrificante não encontrado." }, { status: 404 });
    }
    return NextResponse.json(details);
  } catch (error) {
    console.error("Falha ao carregar detalhes do lubrificante.", error);
    return NextResponse.json({ error: "Falha ao carregar detalhes." }, { status: 500 });
  }
}

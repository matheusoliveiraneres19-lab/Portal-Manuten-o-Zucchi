/**
 * GET /api/mrp/base/current — resumo da Base MRP exibida na aba Base MRP:
 * a base da análise vigente (ou, sem análise, a base ativa), com o aviso de
 * "base ativa diferente" quando for o caso. Leitura: qualquer usuário autenticado.
 */
import { requireApiSession } from "@/lib/auth-guard";
import { errorMessage, ok, serverError } from "@/lib/api-response";
import { getMrpBaseView } from "@/services/mrp-base-view.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  try {
    return ok({ base: await getMrpBaseView() });
  } catch (err) {
    return serverError("Não foi possível consultar a Base MRP.", errorMessage(err));
  }
}

/**
 * POST /api/mrp/import/confirm
 *
 * Confirma a importação das planilhas da Análise MRP: parser (mesma ordem e
 * mensagens do processar() do HTML) → staging → validação → UMA transação com
 * as fontes (Base MRP versionada, estoque, compras). Se qualquer etapa falhar,
 * nada fica utilizável e os históricos ficam FAILED.
 *
 * Aceita "Atualizar tudo" (estoque + compras, com ou sem a planilha do MRP) ou
 * só a planilha do MRP (reimportação da base). A Base MRP nova só é ATIVADA com
 * `activateBase: true`. A análise (motor) NÃO roda aqui — é a FASE D.
 *
 * Corpo: { items: [{ importId, kind, sheet? }], depositFilter?, defaultArea?, activateBase? }
 */
import { type NextRequest } from "next/server";
import { getSession, requireRole } from "@/lib/auth-guard";
import { badRequest, errorMessage, ok, serverError } from "@/lib/api-response";
import { auditImport } from "@/lib/audit-import";
import { isMrpFileKind } from "@/lib/mrp/types";
import { MrpImportError, confirmMrpImport, type MrpConfirmItem } from "@/services/mrp-import.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function parseItems(value: unknown): MrpConfirmItem[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const items: MrpConfirmItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const it = raw as Record<string, unknown>;
    if (typeof it.importId !== "string" || !it.importId || !isMrpFileKind(it.kind)) return null;
    items.push({ importId: it.importId, kind: it.kind, sheet: typeof it.sheet === "string" && it.sheet ? it.sheet : undefined });
  }
  return items;
}

export async function POST(request: NextRequest) {
  const denied = await requireRole(request, ["ADMIN", "GESTOR"]);
  if (denied) return denied;

  const session = await getSession();
  let items: MrpConfirmItem[] | null = null;
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return badRequest("Corpo da requisição inválido.", "JSON malformado");
    items = parseItems(body.items);
    if (!items) return badRequest("Informe as planilhas a confirmar.", "campo 'items' ausente ou inválido");

    const result = await confirmMrpImport({
      items,
      depositFilter: typeof body.depositFilter === "string" ? body.depositFilter : undefined,
      defaultArea: typeof body.defaultArea === "string" ? body.defaultArea : undefined,
      activateBase: body.activateBase === true,
      createdBy: session?.name ?? session?.sub ?? "portal-web"
    });

    console.info(
      `[MRP_IMPORT_DONE] base=${result.baseVersionId ?? "-"}(ativa=${result.baseActivated ?? false}) ` +
        `estoque=${result.stockImportId ?? "-"} compras=${result.purchaseImportId ?? "-"}`
    );
    await auditImport({
      request,
      session,
      module: "Análise MRP",
      fileName: items.map((i) => `${i.kind}:${i.importId}`).join(", "),
      result: {
        totalRows: (result.counts.stock?.rowsRead ?? 0) + (result.counts.purchases?.rowsRead ?? 0),
        importedRows: (result.counts.base?.materials ?? 0) + (result.counts.stock?.rowsAccepted ?? 0) + (result.counts.purchases?.rowsAccepted ?? 0)
      }
    });
    return ok(result);
  } catch (error) {
    const details = errorMessage(error);
    console.error("[MRP_IMPORT_FAILED] etapa=confirm", details);
    await auditImport({
      request,
      session,
      module: "Análise MRP",
      fileName: items?.map((i) => `${i.kind}:${i.importId}`).join(", ") ?? "-",
      error: details
    });
    if (error instanceof MrpImportError) return badRequest(error.userMessage, details);
    return serverError("Não foi possível importar as planilhas. Nenhum dado anterior foi alterado.", details);
  }
}

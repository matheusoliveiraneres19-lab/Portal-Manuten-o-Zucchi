/**
 * POST /api/service-orders/adherence-report
 *
 * Gera o "Relatório de Aderência à Execução das Ordens de Serviços" em PDF.
 *
 * O cliente envia APENAS o período e os filtros da tela — nunca a lista de
 * ordens. Todo o cálculo e a renderização acontecem aqui, numa única leitura do
 * banco; o navegador recebe o PDF pronto. É o que evita trafegar as ~20 mil
 * ordens da base para montar um relatório de algumas centenas.
 *
 * Autenticação: a existente do portal (`requireApiSession`), restrita a
 * ADMIN e GESTOR — é um documento gerencial consolidado, mesmo critério já
 * aplicado à importação de ordens. Nenhuma autenticação nova foi criada.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth-guard";
import { buildAdherenceReportDataset } from "@/services/service-order-adherence-report.service";
import { renderAdherenceReportPdf } from "@/lib/pdf/adherence-report.pdf";
import type { AdherenceReportFilters, AdherenceReportRequest } from "@/types/service-order-adherence-report";

export const dynamic = "force-dynamic";
// pdfkit lê as métricas das fontes padrão do disco: precisa do runtime Node.
export const runtime = "nodejs";
// Recortes largos varrem alguns milhares de linhas e desenham dezenas de páginas.
export const maxDuration = 120;

/** Aceita apenas strings em arrays vindos do cliente (defesa contra payload torto). */
function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return items.length ? items : undefined;
}

/** Data AAAA-MM-DD existente de fato (rejeita "2026-02-31" e "nao-e-data"). */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseFilters(value: unknown): AdherenceReportFilters | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;

  const filters: AdherenceReportFilters = {
    statuses: stringArray(raw.statuses),
    areas: stringArray(raw.areas),
    planningGroups: stringArray(raw.planningGroups),
    responsibles: stringArray(raw.responsibles),
    equipment: typeof raw.equipment === "string" && raw.equipment.trim() ? raw.equipment.trim() : undefined
  };

  return Object.values(filters).some((entry) => entry !== undefined) ? filters : undefined;
}

export async function POST(request: NextRequest) {
  const { error } = await requireApiSession(["ADMIN", "GESTOR"]);
  if (error) return error;

  try {
    const body = (await request.json()) as Partial<AdherenceReportRequest>;

    // Período malformado é erro de QUEM PEDIU, não do servidor: validado aqui para
    // responder 400. Sem isto, o `throw` do service caía no catch e virava 500 —
    // o cliente lia "falha do portal" onde o problema era a data enviada.
    if (!isIsoDate(body.dateFrom) || !isIsoDate(body.dateTo)) {
      return NextResponse.json(
        { ok: false, message: "Informe 'dateFrom' e 'dateTo' como datas válidas no formato AAAA-MM-DD." },
        { status: 400 }
      );
    }

    const dataset = await buildAdherenceReportDataset({
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      useCurrentFilters: body.useCurrentFilters !== false,
      filters: parseFilters(body.filters)
    });

    const pdf = await renderAdherenceReportPdf(dataset);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="${dataset.fileName}"`,
        // Relatório é sempre recalculado: nunca servir de cache do navegador.
        "Cache-Control": "no-store",
        // Permite ao cliente ler o nome do arquivo e o resumo sem baixar duas vezes.
        "X-Report-File-Name": dataset.fileName,
        "X-Report-Total": String(dataset.geral.total),
        "X-Report-Closed": String(dataset.geral.fechadas),
        "X-Report-Adherence": dataset.geral.aderencia === null ? "" : String(dataset.geral.aderencia)
      }
    });
  } catch (caught) {
    console.error("Falha ao gerar o relatório de aderência de Ordens de Serviço.", caught);
    const message = caught instanceof Error ? caught.message : "Falha ao gerar o relatório de aderência.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

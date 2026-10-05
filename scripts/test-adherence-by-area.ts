/**
 * Validação do gráfico "Aderência de execução por área" contra a BASE REAL.
 *
 *   npm run test:adherence-area
 *
 * Unidade: ORDEM de manutenção (osNumber distinto). Para cada cenário (mês
 * completo, mês atual, uma área, um responsável, uma máquina, período vazio):
 *  - abertas + fechadas = total, por área;
 *  - Σ áreas = ordens distintas da TABELA sob os mesmos filtros, recontadas aqui de
 *    forma independente percorrendo `getServiceOrders` página a página;
 *  - linhas de origem = total da tabela = card "Total de OS";
 *  - aderência = fechadas ÷ total × 100; total 0 → área ausente (nunca 0%);
 *  - o detalhe da área devolve exatamente `open` ordens, sem osNumber repetido.
 * Nos meses completos, Mecânica/Elétrica/Terceiros também têm de bater com o
 * relatório PDF de aderência, que conta ordens com a mesma regra.
 */
import { prisma } from "../src/lib/prisma";
import {
  getOpenServiceOrdersByArea,
  getServiceOrderAdherenceByArea,
  getServiceOrderDashboard,
  getServiceOrders
} from "../src/services/service-orders.service";
import { buildAdherenceReportDataset } from "../src/services/service-order-adherence-report.service";
import { isClosedServiceOrder } from "../src/utils/service-order-classification";
import { toEndOfDay, toStartOfDay } from "../src/utils/date-range";
import type { ServiceOrdersQueryParams } from "../src/types/service-orders";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const pct = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`);

/** Recontagem independente: ordens distintas e fechadas a partir das linhas da tabela. */
async function countFromTable(params: ServiceOrdersQueryParams) {
  const byOrder = new Map<string, boolean>();
  let rows = 0;
  for (let page = 1; ; page += 1) {
    const result = await getServiceOrders({ ...params, page, pageSize: 2000 });
    rows += result.data.length;
    result.data.forEach((row) => {
      const closed = isClosedServiceOrder(row);
      byOrder.set(row.osNumber, (byOrder.get(row.osNumber) ?? true) && closed);
    });
    if (page >= result.totalPages) return { rows, total: result.total, orders: byOrder };
  }
}

async function scenario(name: string, params: ServiceOrdersQueryParams, pdfCrossCheck = false) {
  console.log(`\n▶ ${name}  ${JSON.stringify(params)}`);
  const [adherence, dashboard, table] = await Promise.all([
    getServiceOrderAdherenceByArea(params),
    getServiceOrderDashboard(params),
    countFromTable(params)
  ]);

  for (const area of adherence.areas) {
    console.log(
      `    ${area.area.padEnd(17)} ordens ${String(area.total).padStart(5)}  abertas ${String(area.open).padStart(5)}  fechadas ${String(area.closed).padStart(5)}  aderência ${pct(area.adherence)}`
    );
    check(`${area.area}: abertas + fechadas = total`, area.open + area.closed === area.total);
    check(
      `${area.area}: aderência = fechadas ÷ total`,
      area.adherence !== null && Math.abs(area.adherence - (area.closed / area.total) * 100) < 0.01
    );
  }
  console.log(
    `    ${"TOTAL".padEnd(17)} ordens ${String(adherence.total).padStart(5)}  abertas ${String(adherence.open).padStart(5)}  fechadas ${String(adherence.closed).padStart(5)}  aderência ${pct(adherence.adherence)}  | linhas ${adherence.operationRows} | em andamento: ${adherence.periodInProgress}`
  );

  const sum = adherence.areas.reduce((acc, area) => acc + area.total, 0);
  const tableClosed = Array.from(table.orders.values()).filter(Boolean).length;
  check("Σ áreas = ordens distintas da tabela", sum === table.orders.size, `${sum} vs ${table.orders.size}`);
  check("fechadas = ordens 100% encerradas na tabela", adherence.closed === tableClosed, `${adherence.closed} vs ${tableClosed}`);
  check("linhas de origem = total da tabela = card Total de OS",
    adherence.operationRows === table.total && table.total === dashboard.total && table.rows === table.total);
  check("dashboard da página = service isolado", JSON.stringify(dashboard.adherenceByArea) === JSON.stringify(adherence));
  check("nenhuma área com total 0", adherence.areas.every((area) => area.total > 0));
  if (sum === 0) check("total 0 → aderência null", adherence.adherence === null);

  for (const area of adherence.areas) {
    const detail = await getOpenServiceOrdersByArea(params, area.key);
    const unique = new Set(detail.items.map((item) => item.osNumber)).size;
    check(`detalhe ${area.area}: ${detail.totalOpen} ordens abertas = gráfico`, detail.totalOpen === area.open);
    check(`detalhe ${area.area}: sem OS repetida`, unique === detail.items.length);
  }

  if (pdfCrossCheck && params.startDate && params.endDate) {
    const pdf = await buildAdherenceReportDataset({
      dateFrom: params.startDate,
      dateTo: params.endDate,
      useCurrentFilters: false
    });
    const map = { MECANICA: "MEC", ELETRICA: "ELE", TERCEIROS: "SERVICO_TERCEIRO" } as const;
    for (const row of pdf.porArea) {
      const mine = adherence.areas.find((area) => area.key === map[row.area]);
      check(
        `PDF ${row.label}: ${row.fechadas}/${row.total} = gráfico`,
        (mine?.total ?? 0) === row.total && (mine?.closed ?? 0) === row.fechadas,
        `gráfico ${mine?.closed ?? 0}/${mine?.total ?? 0}`
      );
    }
  }

  return adherence;
}

async function main() {
  const september = { startDate: "2026-09-01", endDate: "2026-09-30" };
  const sep = await scenario("Mês completo — setembro/2026", september, true);
  await scenario("Mês completo — agosto/2026", { startDate: "2026-08-01", endDate: "2026-08-31" }, true);

  const current = await scenario("Mês atual — outubro/2026", { startDate: "2026-10-01", endDate: "2026-10-31" });
  check("mês atual sinalizado como em andamento", current.periodInProgress && current.singleMonth);
  check("setembro não sinalizado como em andamento", !sep.periodInProgress);

  const single = await scenario("Uma área — Manut. Eletrica", { ...september, planningGroups: ["Manut. Eletrica"] });
  check("uma área → só Elétrica", single.areas.length === 1 && single.areas[0].key === "ELE");

  const range = { gte: toStartOfDay(september.startDate), lte: toEndOfDay(september.endDate) };
  const topResponsible = await prisma.serviceOrder.groupBy({
    by: ["responsibleName"],
    where: { openedAt: range, responsibleName: { not: null }, planningGroupCode: "ELE" },
    _count: true,
    orderBy: { _count: { responsibleName: "desc" } },
    take: 1
  });
  if (topResponsible[0]?.responsibleName) {
    await scenario(`Um responsável — ${topResponsible[0].responsibleName}`, {
      ...september,
      responsibles: [topResponsible[0].responsibleName]
    });
  }

  const topEquipment = await prisma.serviceOrder.groupBy({
    by: ["equipmentCode"],
    where: { openedAt: range, equipmentCode: { not: null } },
    _count: true,
    orderBy: { _count: { equipmentCode: "desc" } },
    take: 1
  });
  if (topEquipment[0]?.equipmentCode) {
    await scenario(`Uma máquina — ${topEquipment[0].equipmentCode}`, { ...september, equipment: topEquipment[0].equipmentCode });
  }

  const empty = await scenario("Período sem registros — 2020", { startDate: "2020-01-01", endDate: "2020-01-31" });
  check("período vazio → sem áreas e aderência null", empty.areas.length === 0 && empty.adherence === null);

  console.log(failures === 0 ? "\nTODAS AS INVARIANTES PASSARAM" : `\n${failures} FALHA(S)`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());

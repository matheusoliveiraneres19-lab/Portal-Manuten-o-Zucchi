/**
 * Validação do painel "Aderência de execução por área" contra a BASE REAL.
 *
 *   npm run test:adherence-area
 *
 * Unidade: ORDEM de manutenção (osNumber distinto). Para cada cenário (mês
 * completo, mês atual, uma área, um responsável, uma máquina, status, período
 * vazio):
 *  - abertas + fechadas = total = corretivas + planejadas, por área e no geral;
 *  - Σ áreas = ordens distintas da TABELA sob os mesmos filtros, recontadas aqui de
 *    forma independente percorrendo `getServiceOrders` página a página — inclusive
 *    as fechadas (todas as operações encerradas) e as planejadas (PL/PV no título);
 *  - linhas de origem = total da tabela = card "Total de OS";
 *  - aderência = fechadas ÷ total × 100; total 0 → área ausente (nunca 0%);
 *  - o detalhe de cada área devolve as contagens do painel em cada filtro, e as
 *    quatro combinações status × tipo somam o total, sem osNumber repetido.
 * Nos meses completos, Mecânica/Elétrica/Terceiros também têm de bater com o
 * relatório PDF de aderência, que conta ordens com a mesma regra.
 */
import { prisma } from "../src/lib/prisma";
import {
  getServiceOrderAdherenceByArea,
  getServiceOrderDashboard,
  getServiceOrders,
  getServiceOrdersByArea
} from "../src/services/service-orders.service";
import { buildAdherenceReportDataset } from "../src/services/service-order-adherence-report.service";
import { isClosedServiceOrder, isProgrammedPreventiveOrder } from "../src/utils/service-order-classification";
import { toEndOfDay, toStartOfDay } from "../src/utils/date-range";
import type {
  ServiceOrderAreaAdherence,
  ServiceOrderAreaStatusFilter,
  ServiceOrderAreaTypeFilter,
  ServiceOrdersQueryParams
} from "../src/types/service-orders";

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
const pad = (value: number) => String(value).padStart(5);

/** Recontagem independente a partir das linhas da tabela. */
async function countFromTable(params: ServiceOrdersQueryParams) {
  const closedByOrder = new Map<string, boolean>();
  const planned = new Set<string>();
  let rows = 0;
  for (let page = 1; ; page += 1) {
    const result = await getServiceOrders({ ...params, page, pageSize: 2000 });
    rows += result.data.length;
    result.data.forEach((row) => {
      closedByOrder.set(row.osNumber, (closedByOrder.get(row.osNumber) ?? true) && isClosedServiceOrder(row));
      if (isProgrammedPreventiveOrder(row)) planned.add(row.osNumber);
    });
    if (page >= result.totalPages) return { rows, total: result.total, orders: closedByOrder, planned };
  }
}

/** O detalhe da área em cada filtro precisa reproduzir os números da linha do painel. */
async function checkDrillDown(params: ServiceOrdersQueryParams, area: ServiceOrderAreaAdherence) {
  const fetch = (status: ServiceOrderAreaStatusFilter, type: ServiceOrderAreaTypeFilter) =>
    getServiceOrdersByArea(params, area.key, { status, type });

  const [all, open, closed, corrective, planned, openCorrective, openPlanned, closedCorrective, closedPlanned] =
    await Promise.all([
      fetch("all", "all"),
      fetch("open", "all"),
      fetch("closed", "all"),
      fetch("all", "corrective"),
      fetch("all", "planned"),
      fetch("open", "corrective"),
      fetch("open", "planned"),
      fetch("closed", "corrective"),
      fetch("closed", "planned")
    ]);

  const combos = openCorrective.totalMatching + openPlanned.totalMatching + closedCorrective.totalMatching + closedPlanned.totalMatching;
  check(
    `detalhe ${area.area}: todas/abertas/fechadas/corretivas/planejadas = painel`,
    all.totalMatching === area.total &&
      open.totalMatching === area.open &&
      closed.totalMatching === area.closed &&
      corrective.totalMatching === area.corrective &&
      planned.totalMatching === area.planned,
    JSON.stringify({ all: all.totalMatching, open: open.totalMatching, closed: closed.totalMatching, corrective: corrective.totalMatching, planned: planned.totalMatching })
  );
  check(`detalhe ${area.area}: 4 combinações status × tipo somam ${area.total}`, combos === area.total, String(combos));
  check(
    `detalhe ${area.area}: filtros respeitados nas linhas`,
    openCorrective.items.every((item) => !item.closed && !item.programmedType) &&
      closedPlanned.items.every((item) => item.closed && item.programmedType)
  );
  check(
    `detalhe ${area.area}: sem OS repetida`,
    new Set(all.items.map((item) => item.osNumber)).size === all.items.length
  );
  console.log(
    `      corretivas abertas ${openCorrective.totalMatching} · planejadas abertas ${openPlanned.totalMatching} · corretivas fechadas ${closedCorrective.totalMatching} · planejadas fechadas ${closedPlanned.totalMatching}`
  );
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
      `    ${area.area.padEnd(17)} ordens ${pad(area.total)}  abertas ${pad(area.open)}  fechadas ${pad(area.closed)}  aderência ${pct(area.adherence).padStart(6)}  corretivas ${pad(area.corrective)} (${pct(area.correctivePercent)})  planejadas ${pad(area.planned)} (${pct(area.plannedPercent)})`
    );
    check(`${area.area}: abertas + fechadas = total`, area.open + area.closed === area.total);
    check(`${area.area}: corretivas + planejadas = total`, area.corrective + area.planned === area.total);
    check(
      `${area.area}: percentuais = contagens ÷ total`,
      area.adherence !== null &&
        Math.abs(area.adherence - (area.closed / area.total) * 100) < 0.01 &&
        Math.abs((area.correctivePercent ?? -1) - (area.corrective / area.total) * 100) < 0.01 &&
        Math.abs((area.plannedPercent ?? -1) - (area.planned / area.total) * 100) < 0.01
    );
  }
  console.log(
    `    ${"TOTAL".padEnd(17)} ordens ${pad(adherence.total)}  abertas ${pad(adherence.open)}  fechadas ${pad(adherence.closed)}  aderência ${pct(adherence.adherence).padStart(6)}  corretivas ${pad(adherence.corrective)}  planejadas ${pad(adherence.planned)}  | linhas ${adherence.operationRows} | em andamento: ${adherence.periodInProgress}`
  );

  const sum = adherence.areas.reduce((acc, area) => acc + area.total, 0);
  const tableClosed = Array.from(table.orders.values()).filter(Boolean).length;
  check("Σ áreas = ordens distintas da tabela", sum === table.orders.size, `${sum} vs ${table.orders.size}`);
  check("fechadas = ordens 100% encerradas na tabela", adherence.closed === tableClosed, `${adherence.closed} vs ${tableClosed}`);
  check("planejadas = ordens PL/PV na tabela", adherence.planned === table.planned.size, `${adherence.planned} vs ${table.planned.size}`);
  check(
    "geral: abertas + fechadas = corretivas + planejadas = total",
    adherence.open + adherence.closed === adherence.total && adherence.corrective + adherence.planned === adherence.total
  );
  check(
    "linhas de origem = total da tabela = card Total de OS",
    adherence.operationRows === table.total && table.total === dashboard.total && table.rows === table.total
  );
  check("dashboard da página = service isolado", JSON.stringify(dashboard.adherenceByArea) === JSON.stringify(adherence));
  check("nenhuma área com total 0", adherence.areas.every((area) => area.total > 0));
  if (sum === 0) check("total 0 → aderência null", adherence.adherence === null && adherence.correctivePercent === null);

  for (const area of adherence.areas) await checkDrillDown(params, area);

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
        `PDF ${row.label}: ${row.fechadas}/${row.total} = painel`,
        (mine?.total ?? 0) === row.total && (mine?.closed ?? 0) === row.fechadas,
        `painel ${mine?.closed ?? 0}/${mine?.total ?? 0}`
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

  const single = await scenario("Grupo — Manut. Eletrica", { ...september, planningGroups: ["Manut. Eletrica"] });
  check("grupo → só Elétrica", single.areas.length === 1 && single.areas[0].key === "ELE");

  const range = { gte: toStartOfDay(september.startDate), lte: toEndOfDay(september.endDate) };
  const topResponsible = await prisma.serviceOrder.groupBy({
    by: ["responsibleName"],
    where: { openedAt: range, responsibleName: { notIn: ["SEM RESPONSÁVEL", ""] }, planningGroupCode: "ELE" },
    _count: true,
    orderBy: { _count: { responsibleName: "desc" } },
    take: 1
  });
  if (topResponsible[0]?.responsibleName) {
    await scenario(`Responsável — ${topResponsible[0].responsibleName}`, {
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
    await scenario(`Máquina — ${topEquipment[0].equipmentCode}`, { ...september, equipment: topEquipment[0].equipmentCode });
  }

  await scenario("Status da página — LIBERADA", { ...september, statuses: ["LIBERADA"] });

  const empty = await scenario("Período sem registros — 2020", { startDate: "2020-01-01", endDate: "2020-01-31" });
  check("período vazio → sem áreas e aderência null", empty.areas.length === 0 && empty.adherence === null);

  console.log(failures === 0 ? "\nTODAS AS INVARIANTES PASSARAM" : `\n${failures} FALHA(S)`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());

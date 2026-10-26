/**
 * Validação do painel "Análise de ordens por equipamento" contra a BASE REAL.
 *
 *   npm run test:equipment-analysis
 *
 * Para um período mensal e para o histórico inteiro:
 *  - Σ OS do ranking = ordens distintas da TABELA (recontadas aqui página a página),
 *    e Σ horas do ranking = Σ horas da tabela;
 *  - ranking = drawer para as maiores máquinas e para os perfis exigidos (muitas OS,
 *    poucas OS, Mecânica + Elétrica, sem repartimento);
 *  - dentro da máquina: abertas + fechadas = total = corretivas + planejadas =
 *    Σ grupos = Σ tipos = Σ status = Σ repartimentos = Σ responsáveis + sem responsável
 *    = linhas da lista; Σ horas da lista = horas da máquina;
 *  - máquina sem ordens no recorte devolve null (nunca dados gerais).
 */
import { prisma } from "../src/lib/prisma";
import {
  getServiceOrderDashboard,
  getServiceOrderEquipmentAnalysis,
  getServiceOrderEquipmentRanking,
  getServiceOrders
} from "../src/services/service-orders.service";
import type {
  ServiceOrderEquipmentAnalysis,
  ServiceOrderEquipmentRankingItem,
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

const close = (a: number, b: number) => Math.abs(a - b) < 0.11;
const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

async function countFromTable(params: ServiceOrdersQueryParams) {
  const orders = new Set<string>();
  let hours = 0;
  for (let page = 1; ; page += 1) {
    const result = await getServiceOrders({ ...params, page, pageSize: 2000 });
    result.data.forEach((row) => {
      orders.add(row.osNumber);
      hours += row.workedHours ?? 0;
    });
    if (page >= result.totalPages) return { orders: orders.size, hours };
  }
}

function checkInternal(label: string, a: ServiceOrderEquipmentAnalysis) {
  const t = a.totals;
  check(`${label}: abertas + fechadas = total (${t.total})`, t.open + t.closed === t.total);
  check(`${label}: corretivas + planejadas = total`, t.corrective + t.planned === t.total);
  check(`${label}: Σ grupos = total`, sum(a.byPlanningGroup.map((s) => s.count)) === t.total);
  check(`${label}: Σ tipos de ordem = total`, sum(a.byActivityType.map((s) => s.count)) === t.total);
  check(`${label}: Σ status = total`, sum(a.byStatus.map((s) => s.count)) === t.total);
  check(`${label}: Σ repartimentos = total`, sum(a.repartimentos.map((s) => s.orders)) === t.total);
  check(
    `${label}: Σ responsáveis + sem responsável = total`,
    sum(a.responsibles.map((s) => s.count)) + a.quality.withoutResponsible === t.total
  );
  check(`${label}: lista de OS = total`, a.orders.length === t.total && new Set(a.orders.map((o) => o.osNumber)).size === t.total);
  check(`${label}: Σ horas da lista = horas da máquina`, close(sum(a.orders.map((o) => o.hours)), t.hours), `${sum(a.orders.map((o) => o.hours))} vs ${t.hours}`);
  check(`${label}: Σ evolução = OS com data-base`, sum(a.evolution.points.map((p) => p.orders)) === a.orders.filter((o) => o.openedAt).length);
  check(`${label}: abertas na lista = KPI`, a.orders.filter((o) => !o.closed).length === t.open);
  check(`${label}: "SEM RESPONSÁVEL" fora dos colaboradores`, a.responsibles.every((s) => s.label.toUpperCase() !== "SEM RESPONSÁVEL"));
}

function checkSameAsRanking(item: ServiceOrderEquipmentRankingItem, a: ServiceOrderEquipmentAnalysis | null) {
  check(
    `ranking = drawer · ${item.name} (${item.total} OS)`,
    !!a &&
      a.totals.total === item.total &&
      a.totals.open === item.open &&
      a.totals.closed === item.closed &&
      a.totals.corrective === item.corrective &&
      close(a.totals.hours, item.hours),
    a ? JSON.stringify({ drawer: a.totals, ranking: item }) : "drawer vazio"
  );
}

function describe(label: string, a: ServiceOrderEquipmentAnalysis) {
  const list = (slices: Array<{ label: string; count: number }>) => slices.map((s) => `${s.label} ${s.count}`).join(" · ");
  console.log(`\n  ■ ${label}: ${a.name} [${a.key}] — ${a.totals.total} OS, ${a.totals.hours} h, ${a.totals.open} abertas / ${a.totals.closed} fechadas`);
  console.log(`    grupos: ${list(a.byPlanningGroup)}`);
  console.log(`    corretivas ${a.totals.corrective} (${a.totals.correctivePercent}%) · planejadas ${a.totals.planned} (${a.totals.plannedPercent}%)`);
  console.log(`    tipos: ${list(a.byActivityType)}  (derivados: ${a.quality.withoutStructuredActivityType})`);
  console.log(`    status: ${list(a.byStatus)}`);
  console.log(
    `    repartimentos: ${a.repartimentos
      .slice(0, 6)
      .map((r) => `${r.tag === null ? "Sem repartimento" : `${r.code} ${r.description ?? "(sem cadastro)"}`} ${r.orders}`)
      .join(" · ")}${a.repartimentos.length > 6 ? ` · +${a.repartimentos.length - 6}` : ""}`
  );
  console.log(`    responsáveis: ${list(a.responsibles.slice(0, 4))} · sem responsável ${a.quality.withoutResponsible}`);
  console.log(`    evolução (${a.evolution.granularity}): ${a.evolution.points.length} pontos · última OS ${a.lastOrder?.osNumber} ${a.lastOrder?.openedAt.slice(0, 10)}`);
}

async function scenario(name: string, params: ServiceOrdersQueryParams) {
  console.log(`\n▶ ${name}  ${JSON.stringify(params)}`);
  // Em sequência: com connection_limit=1, três varreduras simultâneas da base inteira
  // estouram o tempo do pool e a recontagem da tabela voltaria vazia.
  const ranking = await getServiceOrderEquipmentRanking(params);
  const dashboard = await getServiceOrderDashboard(params);
  const table = await countFromTable(params);

  check(`Σ OS do ranking (${sum(ranking.map((i) => i.total))}) = ordens distintas da tabela (${table.orders})`, sum(ranking.map((i) => i.total)) === table.orders);
  check(`Σ horas do ranking = horas da tabela`, Math.abs(sum(ranking.map((i) => i.hours)) - table.hours) < 0.05 * ranking.length + 0.1);
  check("ranking da página = service isolado", JSON.stringify(dashboard.equipmentRanking) === JSON.stringify(ranking));
  check("card 'Equipamento com mais OS' = 1º do ranking", dashboard.topEquipment?.name === ranking[0]?.name && dashboard.topEquipment?.value === ranking[0]?.total);
  check("ranking ordenado por mais OS", ranking.every((item, i) => i === 0 || ranking[i - 1].total >= item.total));
  check("chave técnica única por máquina", new Set(ranking.map((i) => i.key)).size === ranking.length);
  console.log(`  ${ranking.length} máquinas no recorte`);

  // Maiores máquinas: ranking = drawer.
  const analyses = new Map<string, ServiceOrderEquipmentAnalysis>();
  for (const item of ranking.slice(0, 12)) {
    const a = await getServiceOrderEquipmentAnalysis(item.key, params);
    checkSameAsRanking(item, a);
    if (a) analyses.set(item.key, a);
  }

  // Perfis exigidos.
  const many = ranking[0];
  const few = [...ranking].reverse().find((item) => item.total >= 1)!;
  const fewAnalysis = await getServiceOrderEquipmentAnalysis(few.key, params);
  checkSameAsRanking(few, fewAnalysis);

  let mecEle: ServiceOrderEquipmentAnalysis | null = null;
  let noRepart: ServiceOrderEquipmentAnalysis | null = null;
  for (const item of ranking.slice(0, 60)) {
    const a = analyses.get(item.key) ?? (await getServiceOrderEquipmentAnalysis(item.key, params));
    if (!a) continue;
    const has = (k: string) => a.byPlanningGroup.some((s) => s.key === k && s.count > 0);
    if (!mecEle && item.key !== ranking[0].key && has("MEC") && has("ELE")) mecEle = a;
    if (!noRepart && a.repartimentos.every((r) => r.tag === null)) noRepart = a;
    if (mecEle && noRepart) break;
  }
  if (!noRepart) {
    for (const item of [...ranking].reverse().slice(0, 60)) {
      const a = await getServiceOrderEquipmentAnalysis(item.key, params);
      if (a && a.repartimentos.every((r) => r.tag === null)) {
        noRepart = a;
        checkSameAsRanking(item, a);
        break;
      }
    }
  }

  const manyAnalysis = analyses.get(many.key)!;
  checkInternal("muitas OS", manyAnalysis);
  describe("Muitas OS", manyAnalysis);
  if (fewAnalysis) {
    checkInternal("poucas OS", fewAnalysis);
    describe("Poucas OS", fewAnalysis);
  }
  if (mecEle) {
    checkInternal("Mecânica + Elétrica", mecEle);
    describe("Mecânica + Elétrica", mecEle);
  } else console.log("  (nenhuma máquina com Mecânica e Elétrica no recorte)");
  if (noRepart) {
    checkInternal("sem repartimento", noRepart);
    describe("Sem repartimento", noRepart);
  } else console.log("  (nenhuma máquina sem repartimento no recorte)");

  return { ranking, many };
}

async function main() {
  const september = { startDate: "2026-09-01", endDate: "2026-09-30" };
  const sep = await scenario("Período mensal — setembro/2026", september);
  const sepAnalysis = await getServiceOrderEquipmentAnalysis(sep.many.key, september);
  check("mês único → evolução diária", sepAnalysis?.evolution.granularity === "day");

  const history = await scenario("Período histórico — base inteira", {});
  const histAnalysis = await getServiceOrderEquipmentAnalysis(history.many.key, {});
  check("histórico → evolução mensal", histAnalysis?.evolution.granularity === "month");
  check(
    "a mesma máquina tem MAIS OS no histórico do que em setembro (o drawer respeita o período)",
    !!sepAnalysis && !!(await getServiceOrderEquipmentAnalysis(sep.many.key, {})) &&
      (await getServiceOrderEquipmentAnalysis(sep.many.key, {}))!.totals.total > sepAnalysis.totals.total
  );

  // Filtros da página combinados com a máquina.
  const withStatus = { ...september, statuses: ["LIBERADA" as const] };
  const statusRanking = await getServiceOrderEquipmentRanking(withStatus);
  if (statusRanking[0]) {
    const a = await getServiceOrderEquipmentAnalysis(statusRanking[0].key, withStatus);
    checkSameAsRanking(statusRanking[0], a);
    if (a) checkInternal("filtro status LIBERADA", a);
  }

  check(
    "máquina sem OS no recorte → null (sem fallback para dados gerais)",
    (await getServiceOrderEquipmentAnalysis(sep.many.key, { startDate: "2020-01-01", endDate: "2020-01-31" })) === null
  );
  check("chave inexistente → null", (await getServiceOrderEquipmentAnalysis("ZC-XX-NAO-EXISTE-0000", september)) === null);

  console.log(failures === 0 ? "\nTODAS AS INVARIANTES PASSARAM" : `\n${failures} FALHA(S)`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());

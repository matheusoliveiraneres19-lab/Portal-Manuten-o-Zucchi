/**
 * VALIDAÇÃO da análise conectada de Equipamentos Críticos
 * (evolução por família + seleção família → mês → máquina → repartimento).
 *
 *   npm run validate:critical-evolution
 *
 * Somente leitura. Pelo MESMO caminho da página e da API, prova que:
 *   1. o gráfico de evolução soma o total do recorte (Σ famílias = OS consideradas);
 *   2. em cada passo da navegação (Geral → Família → Máquina → Repartimento →
 *      voltar → limpar), KPIs, grupo de planejamento, corretivas x planejadas,
 *      tipo de atividade, status, ranking e lista de OS usam exatamente as mesmas X OS;
 *   3. o drill-down bate com o recorte (Σ máquinas, Σ repartimentos);
 *   4. filtros gerais continuam valendo (interseção com a seleção);
 *   5. seleção sem dados devolve zero — nunca o total geral;
 *   6. quantas consultas ao banco cada operação faz.
 */
import { PrismaClient } from "@prisma/client";
import type { CriticalEquipmentScopedData, CriticalEquipmentSelection } from "../src/types/critical-equipments";

// Client com contador de consultas, instalado ANTES de carregar os services
// (src/lib/prisma reaproveita `globalThis.prisma` fora de produção).
const counted = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
let queries = 0;
counted.$on("query", (event) => {
  if (process.env.LOG_QUERIES) console.log("    [sql]", event.query.slice(0, 110).replace(/\s+/g, " "));
  if (event.query.trim() !== "SELECT 1") queries += 1;
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = counted;

let failures = 0;
function check(label: string, actual: number, expected: number) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "  OK   " : "  FALHA"} ${label}: ${actual} ${ok ? "=" : "≠"} ${expected}`);
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Todas as visões recortadas precisam somar exatamente X = OS do recorte. */
function checkScope(label: string, data: CriticalEquipmentScopedData): number {
  const x = data.context.totalOrders;
  console.log(`\n-- ${label}: ${data.context.label || "recorte geral"} → ${x} OS`);
  check("KPI total de ordens", data.summary.totalOrdersInPeriod, x);
  check("Σ grupo de planejamento", sum(data.planningGroupDistribution.map((slice) => slice.totalOrders)), x);
  check(
    "corretivas + planejadas (+ não classificadas)",
    data.correctivePlanned.correctiveOrders + data.correctivePlanned.plannedOrders + data.correctivePlanned.unclassifiedOrders,
    x
  );
  console.log(
    `         corretivas ${data.correctivePlanned.correctiveOrders} · planejadas ${data.correctivePlanned.plannedOrders} · não classificadas ${data.correctivePlanned.unclassifiedOrders}`
  );
  check("Σ tipo de atividade", sum(data.activityDistribution.map((slice) => slice.totalOrders)), x);
  check("Σ status", sum(data.statusDistribution.map((slice) => slice.value)), x);
  check("donut: total", data.correctivePlanned.totalOrders, x);
  if (data.selection.family) {
    check(
      "ranking só com a família selecionada",
      data.ranking.filter((item) => item.familyLabel !== data.selection.family).length,
      0
    );
  }
  if (data.selection.machine) {
    check("ranking = só a máquina", data.ranking.length, x > 0 ? 1 : 0);
    check("OS da máquina no ranking", data.ranking[0]?.totalOrders ?? 0, x);
  }
  return x;
}

async function main() {
  const service = await import("../src/services/critical-equipments.service");
  const { NO_COMPONENT_KEY } = await import("../src/services/critical-equipment-evolution.service");
  const empty: CriticalEquipmentSelection = { family: null, month: null, machine: null, partition: null };

  // Página completa (sem seleção) — também dá o período e o gráfico de evolução.
  queries = 0;
  const page = await service.getCriticalEquipmentsPageData({});
  const pageQueries = queries;
  const filters = { startDate: page.period.startDate, endDate: page.period.endDate };
  console.log(`Período: ${filters.startDate} → ${filters.endDate}`);

  console.log("\n== Gráfico de evolução ==");
  check("Σ famílias = OS consideradas", page.familyEvolution.totalOrders, page.audit.consideredOrders);
  check(
    "famílias cuja Σ meses ≠ total",
    page.familyEvolution.families.filter((family) => sum(family.orders) !== family.totalOrders).length,
    0
  );

  const general = checkScope("GERAL (página)", page);
  check("recorte geral = OS consideradas", general, page.audit.consideredOrders);

  // Máquina conhecida: Multifio 04 BM. Se não existir no recorte, usa a maior máquina da maior família.
  const MACHINE = "ZC-SR-G07-MF-0004";
  const machineFamily =
    page.familyEvolution.families.find((family) => family.family === "Multifio")?.family ?? page.familyEvolution.families[0].family;

  queries = 0;
  const family = await service.getCriticalEquipmentDashboardData({ ...empty, family: machineFamily }, filters);
  const apiQueries = queries;
  const familyTotal = checkScope("FAMÍLIA", family);
  check(
    "família = série do gráfico",
    familyTotal,
    page.familyEvolution.families.find((entry) => entry.family === machineFamily)!.totalOrders
  );
  check("Σ máquinas do drill-down", sum(family.drilldown!.machines.map((machine) => machine.totalOrders)), familyTotal);

  const machineTag = family.drilldown!.machines.some((machine) => machine.rootTag === MACHINE)
    ? MACHINE
    : family.drilldown!.machines[0].rootTag;
  const machine = await service.getCriticalEquipmentDashboardData({ ...empty, family: machineFamily, machine: machineTag }, filters);
  const machineTotal = checkScope("FAMÍLIA + MÁQUINA", machine);
  check(
    "máquina = linha do drill-down da família",
    machineTotal,
    family.drilldown!.machines.find((entry) => entry.rootTag === machineTag)!.totalOrders
  );
  check("Σ repartimentos", sum(machine.drilldown!.machine!.components.map((component) => component.totalOrders)), machineTotal);

  const component =
    machine.drilldown!.machine!.components.find((entry) => entry.key !== NO_COMPONENT_KEY) ?? machine.drilldown!.machine!.components[0];
  queries = 0;
  const partition = await service.getCriticalEquipmentDashboardData(
    { ...empty, family: machineFamily, machine: machineTag, partition: component.key },
    filters
  );
  const partitionQueries = queries;
  const partitionTotal = checkScope("FAMÍLIA + MÁQUINA + REPARTIMENTO", partition);
  check("repartimento = linha do drill-down", partitionTotal, component.totalOrders);
  check("lista de OS do repartimento", partition.drilldown!.orders?.total ?? -1, partitionTotal);

  // Mês dentro da máquina (clique família + mês no gráfico).
  const monthSeries = page.familyEvolution.families.find((entry) => entry.family === machineFamily)!;
  const peak = page.familyEvolution.months[monthSeries.orders.indexOf(Math.max(...monthSeries.orders))].period;
  const monthly = await service.getCriticalEquipmentDashboardData({ ...empty, family: machineFamily, month: peak, machine: machineTag }, filters);
  checkScope(`FAMÍLIA + ${peak} + MÁQUINA`, monthly);

  // Voltar e limpar.
  check("voltar p/ máquina", checkScope("VOLTAR → MÁQUINA", await service.getCriticalEquipmentDashboardData({ ...empty, family: machineFamily, machine: machineTag }, filters)), machineTotal);
  check("voltar p/ família", checkScope("VOLTAR → FAMÍLIA", await service.getCriticalEquipmentDashboardData({ ...empty, family: machineFamily }, filters)), familyTotal);
  check("limpar seleção", checkScope("LIMPAR SELEÇÃO", await service.getCriticalEquipmentDashboardData(empty, filters)), general);

  // Filtros gerais ∩ seleção.
  const responsible = page.filterOptions.responsibles[0];
  if (responsible) {
    const filtered = await service.getCriticalEquipmentDashboardData(
      { ...empty, family: machineFamily, machine: machineTag },
      { ...filters, responsibleNames: [responsible] }
    );
    const x = checkScope(`FILTRO Responsável=${responsible} ∩ MÁQUINA`, filtered);
    console.log(`         (${x} de ${machineTotal} OS da máquina são deste responsável)`);
    if (x > machineTotal) {
      failures += 1;
      console.log("  FALHA interseção maior que a máquina");
    }
  }

  // Seleção sem dados: zero em tudo, nunca o total geral.
  const none = await service.getCriticalEquipmentDashboardData({ ...empty, family: machineFamily, machine: "TAG-INEXISTENTE" }, filters);
  check("SEM DADOS: total", checkScope("SELEÇÃO SEM DADOS", none), 0);

  // Página aberta por link já com a seleção = mesma resposta da API.
  queries = 0;
  const pageScoped = await service.getCriticalEquipmentsPageData(filters, {
    ...empty,
    family: machineFamily,
    machine: machineTag,
    partition: component.key
  });
  const pageScopedQueries = queries;
  check("página via URL = API (repartimento)", pageScoped.context.totalOrders, partitionTotal);
  check("página via URL: gráfico de evolução NÃO recortado", pageScoped.familyEvolution.totalOrders, page.familyEvolution.totalOrders);

  console.log("\n== Consultas ao banco ==");
  console.log(`  Página inteira (sem seleção, sem datas na URL): ${pageQueries}`);
  console.log(`  Página via link com seleção até repartimento:   ${pageScopedQueries}`);
  console.log(`  Clique em família/máquina (API do recorte):     ${apiQueries}`);
  console.log(`  Clique em repartimento (inclui lista de OS):    ${partitionQueries}`);

  console.log(failures ? `\n${failures} verificação(ões) FALHARAM.` : "\nTodas as verificações passaram.");
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => counted.$disconnect());

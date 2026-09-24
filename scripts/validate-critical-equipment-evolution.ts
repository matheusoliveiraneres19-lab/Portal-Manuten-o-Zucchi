/**
 * VALIDAÇÃO da "Evolução mensal de ordens por família" + drill-down
 * (aba Equipamentos Críticos).
 *
 *   npm run validate:critical-evolution
 *
 * Somente leitura. Prova, com os dados reais e pelo MESMO caminho da página/API:
 *   1. Σ famílias = total de OS consideradas no recorte (sem filtros de equipamento);
 *   2. Σ meses de cada família = total da família;
 *   3. Σ máquinas = OS da família no mês (drill-down nível 1);
 *   4. Σ repartimentos (inclui "Sem repartimento informado") = OS da máquina;
 *   5. OS listadas no repartimento = número exibido;
 *   6. casos de borda: família com várias máquinas, com uma máquina, máquina com e
 *      sem hierarquia, mês com muitas OS e mês sem OS.
 * E imprime a auditoria de hierarquia (famílias, máquinas com hierarquia, cobertura).
 */
import { prisma } from "../src/lib/prisma";
import {
  getCriticalEquipmentFamilyDrilldown,
  getCriticalEquipmentsPageData
} from "../src/services/critical-equipments.service";
import { ALL_ORDERS_KEY, NO_COMPONENT_KEY } from "../src/services/critical-equipment-evolution.service";
import { getRootFunctionalLocation, resolveFirstLevelChild } from "../src/utils/functional-location-hierarchy";
import { isInvalidTestEquipmentOrder } from "../src/utils/service-order-classification";
import type { FamilyDrilldownSelection } from "../src/types/critical-equipments";

let failures = 0;
function check(label: string, actual: number, expected: number) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "  OK " : "  FALHA"} ${label}: ${actual} ${ok ? "=" : "≠"} ${expected}`);
}

async function auditHierarchy() {
  const locations = await prisma.functionalLocation.findMany({
    select: { tag: true, description: true, costCenter: true, rootTag: true, rootDescription: true, equipmentFamily: true, parentTag: true }
  });
  const lookup = new Map(locations.map((location) => [location.tag, location]));
  const children = new Map<string, number>();
  for (const location of locations) {
    if (location.parentTag) children.set(location.parentTag, (children.get(location.parentTag) ?? 0) + 1);
  }

  const rows = (
    await prisma.serviceOrder.findMany({ select: { equipmentCode: true, equipmentName: true, technicalObjectRaw: true, title: true } })
  ).filter((row) => !isInvalidTestEquipmentOrder(row));

  const machines = new Set<string>();
  const machineFamily = new Map<string, string>();
  const withComponentOrders = new Set<string>();
  const families = new Set<string>();
  let atRoot = 0;
  let registered = 0;
  let unregistered = 0;
  let noTag = 0;
  for (const row of rows) {
    const root = getRootFunctionalLocation(row, lookup);
    if (root.dataQualityIssue) {
      noTag += 1;
      continue;
    }
    machines.add(root.rootTag);
    machineFamily.set(root.rootTag, root.familyLabel);
    families.add(root.familyLabel);
    if (!root.componentTag) {
      atRoot += 1;
      continue;
    }
    withComponentOrders.add(root.rootTag);
    if (resolveFirstLevelChild(root.componentTag, root.rootTag, lookup).registered) registered += 1;
    else unregistered += 1;
  }
  const withHierarchy = Array.from(machines).filter((tag) => (children.get(tag) ?? 0) > 0).length;
  const identified = registered + unregistered;

  console.log("\n== Auditoria da hierarquia (base inteira, sem filtros) ==");
  console.log(`Locais de instalação cadastrados: ${locations.length}`);
  console.log(`OS válidas: ${rows.length} (sem TAG estruturado: ${noTag})`);
  console.log(`Famílias com OS: ${families.size}`);
  console.log(`Máquinas com OS: ${machines.size} · com subdivisões cadastradas: ${withHierarchy}`);
  console.log(
    `OS com repartimento: ${identified} (${((identified / Math.max(1, rows.length - noTag)) * 100).toFixed(1)}%) — ` +
      `cadastrado: ${registered}, TAG fora do cadastro: ${unregistered} · direto na máquina: ${atRoot}`
  );

  // Candidata a "máquina sem hierarquia": sem filhos cadastrados e sem OS em componente.
  const flat = Array.from(machines).find((tag) => !children.get(tag) && !withComponentOrders.has(tag));
  return flat ? { rootTag: flat, family: machineFamily.get(flat)! } : null;
}

async function validateSelection(selection: FamilyDrilldownSelection, expectedFamilyOrders: number, label: string) {
  console.log(`\n-- ${label}: ${selection.family} / ${selection.month ?? "período inteiro"}`);
  const level1 = await getCriticalEquipmentFamilyDrilldown(selection);
  check("OS da família (drill) = valor do gráfico", level1.family.totalOrders, expectedFamilyOrders);
  check("Σ máquinas = OS da família", level1.machines.reduce((sum, m) => sum + m.totalOrders, 0), level1.family.totalOrders);
  check(
    "corretivas + planejadas + não classif. = OS",
    level1.family.correctiveOrders + level1.family.plannedOrders + level1.family.unclassifiedOrders,
    level1.family.totalOrders
  );
  if (!level1.machines.length) {
    console.log("  (sem máquinas neste recorte — painel mostra estado vazio)");
    return;
  }

  const machine = level1.machines[0];
  const level2 = await getCriticalEquipmentFamilyDrilldown({ ...selection, machine: machine.rootTag });
  const detail = level2.machine!;
  console.log(
    `  máquina: ${detail.name} (${detail.rootTag}) · hierarquia: ${detail.hasHierarchy ? "sim" : "não"} · cobertura ${detail.coverage.percent}%`
  );
  check("Σ repartimentos = OS da máquina", detail.components.reduce((sum, c) => sum + c.totalOrders, 0), machine.totalOrders);
  check("identificadas + sem repartimento = OS da máquina", detail.coverage.identified + detail.coverage.unidentified, machine.totalOrders);

  const component = detail.components.find((current) => current.key !== NO_COMPONENT_KEY) ?? detail.components[0];
  const level3 = await getCriticalEquipmentFamilyDrilldown({ ...selection, machine: machine.rootTag, component: component.key });
  check(`OS listadas em "${component.label}" = número exibido`, level3.orders?.total ?? -1, component.totalOrders);

  const all = await getCriticalEquipmentFamilyDrilldown({ ...selection, machine: machine.rootTag, component: ALL_ORDERS_KEY });
  check("todas as OS da máquina = OS da máquina", all.orders?.total ?? -1, machine.totalOrders);
}

async function main() {
  const flatMachine = await auditHierarchy();

  console.log("\n== Gráfico (página sem filtros de equipamento) ==");
  const page = await getCriticalEquipmentsPageData({});
  const evolution = page.familyEvolution;
  console.log(`Período: ${page.period.startDate} → ${page.period.endDate} · meses no eixo: ${evolution.months.length}`);
  check("Σ famílias = OS consideradas na página", evolution.totalOrders, page.summary.totalOrdersInPeriod);
  check("Σ séries = total do gráfico", evolution.families.reduce((sum, f) => sum + f.totalOrders, 0), evolution.totalOrders);
  const monthMismatch = evolution.families.filter((f) => f.orders.reduce((a, b) => a + b, 0) !== f.totalOrders);
  check("famílias cuja Σ meses ≠ total", monthMismatch.length, 0);

  const byMachines = [...evolution.families].sort((a, b) => b.machineCount - a.machineCount);
  const many = byMachines[0];
  const single = evolution.families.find((family) => family.machineCount === 1 && family.totalOrders >= 5) ?? byMachines[byMachines.length - 1];
  const top = evolution.families[0];

  const peakIndex = top.orders.indexOf(Math.max(...top.orders));
  await validateSelection({ family: top.family, month: evolution.months[peakIndex].period, machine: null, component: null }, top.orders[peakIndex], "Mês com muitas OS");

  const manyPeak = many.orders.indexOf(Math.max(...many.orders));
  await validateSelection({ family: many.family, month: evolution.months[manyPeak].period, machine: null, component: null }, many.orders[manyPeak], `Família com várias máquinas (${many.machineCount})`);

  await validateSelection({ family: single.family, month: null, machine: null, component: null }, single.totalOrders, "Família com uma máquina");

  const zeroFamily = evolution.families.find((family) => family.orders.some((value) => value === 0));
  if (zeroFamily) {
    const zeroIndex = zeroFamily.orders.indexOf(0);
    await validateSelection({ family: zeroFamily.family, month: evolution.months[zeroIndex].period, machine: null, component: null }, 0, "Mês sem OS");
  }

  console.log("\n-- Máquina sem hierarquia");
  if (flatMachine) {
    const level2 = await getCriticalEquipmentFamilyDrilldown({ family: flatMachine.family, month: null, machine: flatMachine.rootTag, component: null });
    const machine = level2.machines.find((current) => current.rootTag === flatMachine.rootTag);
    console.log(`  ${level2.machine?.name} (${flatMachine.family}) · hierarquia: ${level2.machine?.hasHierarchy ? "sim" : "não"}`);
    check("hasHierarchy = false", Number(level2.machine?.hasHierarchy ?? true), 0);
    check("lista direta = OS da máquina", level2.orders?.total ?? -1, machine?.totalOrders ?? -2);
  } else {
    console.log("  nenhuma máquina sem hierarquia na base");
  }

  console.log(failures ? `\n${failures} verificação(ões) FALHARAM.` : "\nTodas as verificações de soma passaram.");
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

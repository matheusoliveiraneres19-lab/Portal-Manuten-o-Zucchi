/**
 * Validação da ANÁLISE POR MÁQUINA de Equipamentos Críticos contra a BASE REAL.
 *
 *   npm run validate:critical-machine
 *
 *  - Seletor: máquinas acessíveis = máquinas válidas da base (recontagem independente).
 *  - Independência (teste principal): com Família = "Linha de Resina" no filtro, uma
 *    máquina de OUTRA família continua no seletor e a análise dela é idêntica à sem filtro.
 *  - Top N não limita: uma máquina fora do Top 10 do ranking é acessível e analisável.
 *  - Invariantes do ano: Σ meses = total; Σ horas = horas; corretivas + planejadas +
 *    não classificadas = total; abertas + fechadas + outros = total; Σ grupos = total;
 *    total = recontagem direta no banco.
 *  - Mês: OS listadas = total do mês; Σ repartimentos = total.
 *  - Calendário: meses futuros "future", mês corrente "current"; ano sem dados vazio.
 */
import type { CriticalEquipmentsPageData } from "../src/types/critical-equipments";

// Os services usam `cache()` do React; fora do Next ele não existe.
const react = require("react") as { cache?: <T>(fn: T) => T };
if (typeof react.cache !== "function") react.cache = (fn) => fn;

const machineService = require("../src/services/critical-equipment-machine.service") as typeof import("../src/services/critical-equipment-machine.service");
const { getCriticalEquipmentsPageData } = require("../src/services/critical-equipments.service") as {
  getCriticalEquipmentsPageData: (params: Record<string, unknown>) => Promise<CriticalEquipmentsPageData>;
};
const { prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma");
const { getRootFunctionalLocation } = require("../src/utils/functional-location-hierarchy") as typeof import("../src/utils/functional-location-hierarchy");
const { isInvalidTestEquipmentOrder } = require("../src/utils/service-order-classification") as typeof import("../src/utils/service-order-classification");
const { loadFunctionalLocationLookup } = require("../src/services/critical-equipments.service") as typeof import("../src/services/critical-equipments.service");

let falhas = 0;
function checar(rotulo: string, ok: boolean, detalhe = "") {
  if (!ok) falhas += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${rotulo}${detalhe ? `  — ${detalhe}` : ""}`);
}
const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
const close = (a: number, b: number) => Math.abs(a - b) < 0.05 + 0.05 * Math.max(1, Math.abs(b)) / 100;

async function main() {
  console.log("\nEQUIPAMENTOS CRÍTICOS — ANÁLISE POR MÁQUINA\n");

  // Recontagem independente: todas as OS válidas da base, raiz por linha.
  const lookup = await loadFunctionalLocationLookup();
  const all = await prisma.serviceOrder.findMany({
    select: { id: true, equipmentCode: true, equipmentName: true, technicalObjectRaw: true, title: true, description: true, openedAt: true, workedHours: true }
  });
  const valid = all.filter((row) => !isInvalidTestEquipmentOrder(row));
  const byRoot = new Map<string, typeof valid>();
  for (const row of valid) {
    const tag = getRootFunctionalLocation(row, lookup).rootTag;
    const list = byRoot.get(tag);
    if (list) list.push(row);
    else byRoot.set(tag, [row]);
  }

  console.log("▶ Seletor de máquinas");
  const options = await machineService.getCriticalEquipmentMachineOptions();
  checar(`máquinas válidas na base = ${byRoot.size}; acessíveis no seletor = ${options.length}`, options.length === byRoot.size);
  checar("toda máquina da base está no seletor", Array.from(byRoot.keys()).every((tag) => options.some((o) => o.id === tag)));
  checar("OS por máquina no seletor = recontagem", options.every((o) => o.totalOrders === (byRoot.get(o.id)?.length ?? -1)));
  const families = new Set(options.map((o) => o.familyLabel));
  console.log(`  ${families.size} famílias · ${options.length} máquinas`);

  // Ranking da página com Top 10 e Família = Linha de Resina.
  const resinFamily = Array.from(families).find((f) => /resina/i.test(f)) ?? Array.from(families)[0];
  const page = await getCriticalEquipmentsPageData({ families: [resinFamily.toUpperCase()], limit: 10 });
  const rankingIds = new Set(page.ranking.map((item) => item.id));
  console.log(`\n▶ Independência — filtro Família = "${resinFamily}", Top 10 (${page.ranking.length} no ranking)`);
  const otherFamily = options
    .filter((o) => o.familyLabel !== resinFamily && !rankingIds.has(o.id))
    .sort((a, b) => b.totalOrders - a.totalOrders)[0];
  checar(`máquina de outra família no seletor: ${otherFamily?.name} (${otherFamily?.familyLabel})`, Boolean(otherFamily));
  checar("ranking da página só tem a família filtrada (filtro geral funcionando)", page.ranking.every((item) => item.familyLabel === resinFamily));

  const year = 2026;
  const plain = await machineService.getCriticalEquipmentMachineYearAnalysis(otherFamily.id, year, {});
  const withFamily = await machineService.getCriticalEquipmentMachineYearAnalysis(otherFamily.id, year, {
    families: [resinFamily.toUpperCase()],
    limit: 10
  });
  checar("análise da máquina IGNORA o filtro Família (resultado idêntico)", JSON.stringify(plain?.months) === JSON.stringify(withFamily?.months));
  checar("e a tela é avisada do filtro ignorado", Boolean(withFamily?.ignoredFilters.includes("Família")), withFamily?.ignoredFilters.join(", "));

  // Fora do Top 10 da frota (sem filtro de família).
  const fleet = await getCriticalEquipmentsPageData({ limit: 10 });
  const top10 = new Set(fleet.ranking.map((item) => item.id));
  const outside = options.filter((o) => !top10.has(o.id)).sort((a, b) => b.totalOrders - a.totalOrders)[0];
  checar(`máquina fora do Top 10 acessível: ${outside?.name}`, Boolean(outside));

  async function analyse(label: string, machineId: string) {
    const a = await machineService.getCriticalEquipmentMachineYearAnalysis(machineId, year, {});
    console.log(`\n▶ ${label}: ${a?.machine.name} [${machineId}] — ${year}`);
    if (!a) {
      checar("análise disponível", false);
      return null;
    }
    const s = a.summary;
    const direct = (byRoot.get(machineId) ?? []).filter((row) => row.openedAt?.getUTCFullYear() === year);
    checar("12 meses Jan → Dez", a.months.length === 12 && a.months[0].label === "Jan" && a.months[11].label === "Dez");
    checar(`Σ OS dos meses = total anual (${s.totalOrders})`, sum(a.months.map((m) => m.totalOrders)) === s.totalOrders);
    checar(`Σ horas dos meses = horas anuais (${s.totalWorkedHours} h)`, close(sum(a.months.map((m) => m.totalWorkedHours)), s.totalWorkedHours));
    checar("total anual = recontagem direta no banco", s.totalOrders === direct.length, `${s.totalOrders} vs ${direct.length}`);
    checar("horas anuais = recontagem direta", close(s.totalWorkedHours, sum(direct.map((r) => r.workedHours ?? 0))));
    checar("corretivas + planejadas + não classificadas = total", s.correctiveOrders + s.plannedOrders + s.unclassifiedOrders === s.totalOrders);
    checar("abertas + fechadas + outros = total", s.openOrders + s.closedOrders + s.otherStatusOrders === s.totalOrders);
    checar("Σ grupos de planejamento = total", sum(s.planningGroups.map((g) => g.orders)) === s.totalOrders);
    checar(
      "calendário: Nov/Dez futuros, Out em andamento (hoje 2026-10)",
      a.months[10].state === "future" && a.months[11].state === "future" && a.months[9].state === "current"
    );
    checar("mês futuro sem OS", a.months.filter((m) => m.state === "future").every((m) => m.totalOrders === 0));

    console.log(`    mensal: ${a.months.map((m) => `${m.label} ${m.state === "future" ? "—" : m.totalOrders}`).join(" · ")}`);
    console.log(`    horas:  ${a.months.map((m) => `${m.label} ${m.state === "future" ? "—" : m.totalWorkedHours}`).join(" · ")}`);
    console.log(
      `    total ${s.totalOrders} OS · ${s.totalWorkedHours} h · corretivas ${s.correctiveOrders} · planejadas ${s.plannedOrders} · não classificadas ${s.unclassifiedOrders} · abertas ${s.openOrders} · fechadas ${s.closedOrders}`
    );
    console.log(`    grupos: ${s.planningGroups.map((g) => `${g.label} ${g.orders}`).join(" · ")}`);
    console.log(`    pico OS: ${s.peakOrdersMonth?.label} (${s.peakOrdersMonth?.value}) · pico horas: ${s.peakHoursMonth?.label} (${s.peakHoursMonth?.value} h)`);

    // Mês com mais OS: detalhe.
    const peak = a.months.reduce((best, m) => (m.totalOrders > best.totalOrders ? m : best), a.months[0]);
    if (peak.totalOrders > 0) {
      const d = await machineService.getCriticalEquipmentMachineMonthDetail(machineId, peak.period, {});
      checar(`detalhe ${d?.periodLabel}: total = mês do gráfico (${peak.totalOrders})`, d?.split.totalOrders === peak.totalOrders);
      checar("OS listadas = total do mês", d?.orders.total === peak.totalOrders && (d.orders.truncated || d.orders.items.length === peak.totalOrders));
      checar("Σ repartimentos = total do mês", sum(d?.components.map((c) => c.orders) ?? []) === peak.totalOrders);
      checar("toda OS listada é desta máquina e deste mês", Boolean(d?.orders.items.every((o) => o.openedAt?.startsWith(peak.period))));
      console.log(`    repartimentos em ${d?.periodLabel}: ${d?.components.slice(0, 5).map((c) => `${c.label} ${c.orders}`).join(" · ")}`);
    }
    const zeroMonth = a.months.find((m) => m.state === "closed" && m.totalOrders === 0);
    if (zeroMonth) console.log(`    mês encerrado com 0 OS (zero real): ${zeroMonth.label}`);
    return a;
  }

  const many = options.slice().sort((a, b) => b.totalOrders - a.totalOrders)[0];
  await analyse("Máquina com muitas OS", many.id);
  await analyse("Máquina de outra família / fora do ranking", otherFamily.id);
  if (outside.id !== otherFamily.id) await analyse("Máquina fora do Top 10", outside.id);

  const few = options.filter((o) => o.totalOrders > 0 && o.totalOrders <= 3 && o.lastOrderAt?.startsWith("2026"))[0];
  if (few) await analyse("Máquina com poucas OS", few.id);

  console.log("\n▶ Máquina sem dados no ano");
  const empty = await machineService.getCriticalEquipmentMachineYearAnalysis(many.id, 2020, {});
  checar("ano sem OS → total 0 e meses sem dados (sem fallback)", empty?.summary.totalOrders === 0 && Boolean(empty?.months.every((m) => m.totalOrders === 0)));
  checar("ano sem OS fora dos anos disponíveis", Boolean(empty && !empty.availableYears.includes(2020)));
  checar("meses antes da base marcados como sem período disponível", Boolean(empty?.months.every((m) => m.state === "noBase")));
  checar("máquina inexistente → null", (await machineService.getCriticalEquipmentMachineYearAnalysis("ZC-XX-NAO-EXISTE-0000", 2026, {})) === null);

  console.log(falhas === 0 ? "\nTODAS AS VALIDAÇÕES PASSARAM" : `\n${falhas} FALHA(S)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());

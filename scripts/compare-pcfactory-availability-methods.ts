/**
 * COMPARAÇÃO DOS DOIS MÉTODOS DE DISPONIBILIDADE — Física (nova regra oficial) x G0134.
 *
 *   npm run compare:pc-factory-availability                     # agosto/2026
 *   npm run compare:pc-factory-availability 2026-08-01 2026-08-31
 *   npm run compare:pc-factory-availability 2026-08-01 2026-08-10
 *
 * Roda sobre TODAS as máquinas do recorte — não há lista fixa de equipamentos.
 * Só leitura: nenhuma linha é escrita.
 *
 * Para cada máquina imprime:
 *   Paradas | Horas calendário | Disponibilidade Física | Disponibilidade G0134 | Δ p.p.
 *
 * Objetivo: medir exatamente quanto muda com a nova regra antes de ela virar a única
 * fonte de verdade das telas. Divergir do G0134 NÃO é erro — são denominadores
 * diferentes de propósito (tempo-calendário x LOADTIME).
 *
 * Também confere as invariantes da fórmula nova máquina a máquina:
 *   Horas Disponíveis = Tempo Total − Paradas
 *   Disponibilidade   = Horas Disponíveis / Tempo Total × 100
 */
import { prisma } from "../src/lib/prisma";

// O service usa `cache()` do React para deduplicar a carga dentro de um render.
// Fora do Next essa função não existe, então aqui ela vira identidade.
const react = require("react") as { cache?: <T>(fn: T) => T };
if (typeof react.cache !== "function") react.cache = (fn) => fn;

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  getPcFactoryAvailabilityByMachine,
  getPcFactoryDashboardKPIs,
  getPcFactoryGroupSummary,
  resolvePeriodWindow
} = require("../src/services/pc-factory.service") as typeof import("../src/services/pc-factory.service");
const {
  calculatePeriodHours
} = require("../src/utils/pc-factory-physical-availability") as typeof import("../src/utils/pc-factory-physical-availability");

const DATE_FROM = process.argv[2] ?? "2026-08-01";
const DATE_TO = process.argv[3] ?? "2026-08-31";

const fmt = (value: number | null, digits = 1) =>
  value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

const pad = (value: string, width: number) => value.padEnd(width).slice(0, width);
const padStart = (value: string, width: number) => value.padStart(width);

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const params = { startDate: DATE_FROM, endDate: DATE_TO };

  console.log(`\n=== DISPONIBILIDADE: FÍSICA x G0134 — ${DATE_FROM} a ${DATE_TO} ===\n`);

  const period = await resolvePeriodWindow(params);
  const expectedHours = calculatePeriodHours(DATE_FROM, DATE_TO);
  console.log(`Tempo Total do Período (por máquina): ${period.hours} h   [origem: ${period.source}]`);
  console.log(`Conferência calculatePeriodHours():   ${expectedHours} h\n`);

  const rows = await getPcFactoryAvailabilityByMachine(params);
  if (rows.length === 0) {
    console.log("Nenhuma máquina no recorte.");
    return;
  }

  // Menor disponibilidade primeiro — é a ordem pedida para a varredura.
  const ordered = [...rows].sort((a, b) => (a.availabilityPercent ?? 101) - (b.availabilityPercent ?? 101));

  console.log(`Máquinas analisadas: ${ordered.length}\n`);
  console.log(
    pad("MÁQUINA", 26) +
      padStart("PARADAS", 10) +
      padStart("CALEND.", 10) +
      padStart("DISPON.", 10) +
      padStart("FÍSICA%", 10) +
      padStart("G0134%", 10) +
      padStart("Δ p.p.", 10)
  );
  console.log("-".repeat(86));

  let sumDowntime = 0;
  let deltaSum = 0;
  let deltaCount = 0;
  let worstDelta = { machine: "", delta: 0 };
  const inconsistent: string[] = [];

  for (const row of ordered) {
    sumDowntime += row.downtimeHours;

    const delta =
      row.availabilityPercent !== null && row.g0134AvailabilityPercent !== null
        ? row.availabilityPercent - row.g0134AvailabilityPercent
        : null;
    if (delta !== null) {
      deltaSum += Math.abs(delta);
      deltaCount += 1;
      if (Math.abs(delta) > Math.abs(worstDelta.delta)) worstDelta = { machine: row.machineName, delta };
    }
    if (row.downtimeExceedsPeriod) inconsistent.push(row.machineName);

    console.log(
      pad(row.machineName, 26) +
        padStart(fmt(row.downtimeHours), 10) +
        padStart(fmt(row.periodHours), 10) +
        padStart(fmt(row.availableHours), 10) +
        padStart(fmt(row.availabilityPercent), 10) +
        padStart(fmt(row.g0134AvailabilityPercent), 10) +
        padStart(delta === null ? "—" : (delta > 0 ? "+" : "") + delta.toFixed(1), 10)
    );
  }

  console.log("-".repeat(86));
  console.log(
    `Diferença média |Física − G0134|: ${deltaCount ? (deltaSum / deltaCount).toFixed(1) : "—"} p.p.  ` +
      `| maior: ${worstDelta.machine} (${worstDelta.delta > 0 ? "+" : ""}${worstDelta.delta.toFixed(1)} p.p.)`
  );

  /* ---------------- Frota e grupos ---------------- */
  const kpis = await getPcFactoryDashboardKPIs(params);
  console.log("\n=== FROTA (agregado ponderado) ===");
  console.log(`  Máquinas válidas ........... ${kpis.machineCount}`);
  console.log(`  Horas/máquina no período ... ${fmt(kpis.periodHoursPerMachine)} h`);
  console.log(`  Tempo Total da frota ....... ${fmt(kpis.totalPeriodHours)} h`);
  console.log(`  Paradas (soma) ............. ${fmt(kpis.downtimeHours)} h`);
  console.log(`  Horas disponíveis .......... ${fmt(kpis.availableHours)} h`);
  console.log(`  Disponibilidade Física ..... ${fmt(kpis.availabilityPercent, 2)} %`);
  console.log(`  Disponibilidade G0134 ...... ${fmt(kpis.g0134AvailabilityPercent, 2)} %  (auditoria)`);

  const groups = await getPcFactoryGroupSummary(params);
  console.log("\n=== GRUPOS DE ÁREA (denominador = horas × máquinas do grupo) ===");
  for (const group of groups) {
    console.log(
      `  ${pad(group.groupPortal, 24)} máquinas=${padStart(String(group.resourcesCount), 3)}  ` +
        `total=${padStart(fmt(group.totalPeriodHours), 10)} h  paradas=${padStart(fmt(group.maintenanceHours), 9)} h  ` +
        `física=${padStart(fmt(group.availabilityPercent, 2), 7)} %`
    );
  }

  /* ---------------- Invariantes ---------------- */
  console.log("\n=== INVARIANTES (fórmula nova) ===");
  check(
    "Horas Disponíveis = Tempo Total − Paradas (todas as máquinas)",
    ordered.every((r) => Math.abs(r.availableHours - Math.max(0, r.periodHours - r.downtimeHours)) < 0.02)
  );
  check(
    "Disponibilidade = Disponíveis / Total × 100 (todas as máquinas)",
    ordered.every((r) => {
      if (r.periodHours <= 0) return r.availabilityPercent === null;
      const expected = (r.availableHours / r.periodHours) * 100;
      return r.availabilityPercent !== null && Math.abs(r.availabilityPercent - expected) < 0.01;
    })
  );
  check("Nenhum NaN / Infinity", ordered.every((r) => r.availabilityPercent === null || Number.isFinite(r.availabilityPercent)));
  check("Nenhuma acima de 100 %", ordered.every((r) => (r.availabilityPercent ?? 0) <= 100));
  check("Nenhuma abaixo de 0 %", ordered.every((r) => (r.availabilityPercent ?? 0) >= 0));
  check(
    "Todas usam o MESMO tempo-calendário do período",
    ordered.every((r) => Math.abs(r.periodHours - period.hours) < 0.02)
  );
  check(
    "Paradas da linha = soma dos seis subtipos",
    ordered.every(
      (r) =>
        Math.abs(
          r.downtimeHours -
            (r.mechanicalHours +
              r.electricalHours +
              r.automationHours +
              r.plannedMaintenanceHours +
              r.thirdPartyHours +
              r.waitingMaintenanceHours)
        ) < 0.02
    )
  );
  check(
    "Paradas da frota = soma das paradas por máquina",
    Math.abs(kpis.downtimeHours - sumDowntime) < 0.5,
    `frota=${fmt(kpis.downtimeHours)} vs soma=${fmt(sumDowntime)}`
  );

  if (inconsistent.length) {
    console.log(
      `\n⚠  ${inconsistent.length} máquina(s) com paradas MAIORES que as horas-calendário ` +
        "(sobreposição ou duplicidade de registros):"
    );
    inconsistent.forEach((name) => console.log(`   - ${name}`));
    console.log("   O portal sinaliza isso na qualidade dos dados; a disponibilidade fica em 0 %.");
  }

  console.log(failures === 0 ? "\n✅ Invariantes OK.\n" : `\n❌ ${failures} invariante(s) falharam.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

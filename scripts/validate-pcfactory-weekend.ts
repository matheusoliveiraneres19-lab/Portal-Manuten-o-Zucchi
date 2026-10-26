/**
 * VALIDAÇÃO DA MANUTENÇÃO EM FIM DE SEMANA CONTRA A BASE REAL — só leitura.
 *
 *   npm run validate:pc-factory-weekend
 *   npm run validate:pc-factory-weekend -- --snapshot <arquivo.json>
 *
 * 1. Totais reais: registros de manutenção KPI com horas em sábado/domingo e soma
 *    das Horas FDS (base inteira, America/Sao_Paulo).
 * 2. Ranking de máquinas críticas em vários recortes (base, período, máquina, grupo):
 *    0 ≤ FDS ≤ total e 0 ≤ % ≤ 100 em todas as máquinas.
 * 3. Filtros: o FDS de uma máquina filtrada bate com o da mesma máquina no ranking sem
 *    filtro de máquina, e a tabela "Somente FDS" respeita o filtro.
 * 4. --snapshot grava KPIs, ranking (SEM os campos novos), tendência e confiabilidade
 *    para comparar com a mesma execução na main — prova de que os números antigos não
 *    mudaram.
 */
import fs from "fs";
import type { PcFactoryPageData, PcFactoryQueryParams, PcFactoryRecordsResult } from "../src/types/pc-factory";
import { prisma } from "../src/lib/prisma";
import { isMaintenanceKpi } from "../src/utils/pc-factory-normalizer";
import { pcFactoryMaintenanceWeekendHours } from "../src/utils/pc-factory-weekend";

// Fora do Next `cache()` não existe — vira identidade (mesmo shim dos outros scripts).
const react = require("react") as { cache?: <T>(fn: T) => T };
if (typeof react.cache !== "function") react.cache = (fn) => fn;

const { getPcFactoryPageData, getPcFactoryRecords } = require("../src/services/pc-factory.service") as {
  getPcFactoryPageData: (params: PcFactoryQueryParams) => Promise<PcFactoryPageData>;
  getPcFactoryRecords: (params: PcFactoryQueryParams) => Promise<PcFactoryRecordsResult>;
};

const MACHINE = "Multifio 04 - BM";
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const br = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function sixKinds(row: PcFactoryPageData["criticalResources"][number]): number {
  return row.mechanicalHours + row.electricalHours + row.automationHours + row.planejadaHours + row.terceirosHours + row.waitingHours;
}

function printRanking(title: string, page: PcFactoryPageData) {
  console.log(`\n--- ${title} ---`);
  const rows = [...page.criticalResources].sort((a, b) => sixKinds(b) - sixKinds(a));
  for (const row of rows) {
    const total = sixKinds(row);
    console.log(
      `  ${row.resourceName.padEnd(34)} ${br(total).padStart(10)} h   FDS ${br(row.weekendMaintenanceHours).padStart(9)} h · ${br(row.weekendMaintenancePercent).padStart(5)}%`
    );
    const ok =
      row.weekendMaintenanceHours >= 0 &&
      row.weekendMaintenanceHours <= total + 0.01 &&
      row.weekendMaintenancePercent >= 0 &&
      row.weekendMaintenancePercent <= 100;
    if (!ok) check(`${title}: invariantes de ${row.resourceName}`, false, JSON.stringify(row));
  }
  check(`${title}: 0 ≤ FDS ≤ total e 0 ≤ % ≤ 100 em ${rows.length} máquinas`, true);
}

/**
 * O service devolve a tela VAZIA quando uma consulta falha (catch interno). O pooler
 * do Supabase às vezes recusa conexões sob as consultas paralelas da página, então
 * uma carga vazia é tentada de novo — e, se persistir, a validação reprova em vez de
 * aprovar sobre dados vazios.
 */
async function loadPage(params: PcFactoryQueryParams): Promise<PcFactoryPageData> {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const page = await getPcFactoryPageData(params);
    if (page.criticalResources.length > 0) return page;
    console.log(`  (carga vazia para ${JSON.stringify(params)} — tentativa ${attempt})`);
  }
  throw new Error(`Página PC-Factory vazia após 4 tentativas: ${JSON.stringify(params)}`);
}

function stripWeekend(page: PcFactoryPageData) {
  return {
    kpis: page.kpis,
    criticalResources: page.criticalResources.map((row) => {
      const { weekendMaintenanceHours: _h, weekendMaintenancePercent: _p, ...rest } = row as typeof row & Record<string, unknown>;
      return rest;
    }),
    trend: page.trend,
    reliabilityByMachine: page.reliabilityByMachine,
    maintenanceSplit: page.maintenanceSplit
  };
}

async function main() {
  const snapshotIndex = process.argv.indexOf("--snapshot");
  const snapshotPath = snapshotIndex > 0 ? process.argv[snapshotIndex + 1] : null;

  console.log("\n=== 1. BASE REAL (America/Sao_Paulo) ===");
  const maintenance = await prisma.pcFactoryRecord.findMany({
    where: { isMaintenanceKpi: true, endDateTime: { not: null } },
    select: { statusRaw: true, isMaintenanceKpi: true, startDateTime: true, endDateTime: true, durationHours: true }
  });
  let weekendRecords = 0;
  let weekendHours = 0;
  let maintenanceHours = 0;
  let flagMismatch = 0;
  for (const record of maintenance) {
    if (record.isMaintenanceKpi !== isMaintenanceKpi(record.statusRaw)) flagMismatch += 1;
    maintenanceHours += record.durationHours > 0 ? record.durationHours : 0;
    const hours = pcFactoryMaintenanceWeekendHours(record);
    if (hours > 0) {
      weekendRecords += 1;
      weekendHours += hours;
    }
  }
  console.log(`  Registros de manutenção KPI (com término): ${maintenance.length.toLocaleString("pt-BR")}`);
  console.log(`  Registros com manutenção em FDS:           ${weekendRecords.toLocaleString("pt-BR")}`);
  console.log(`  Horas de manutenção (base inteira):        ${br(maintenanceHours)} h`);
  console.log(`  Horas FDS (base inteira):                  ${br(weekendHours)} h (${br((weekendHours / maintenanceHours) * 100)}%)`);
  check("flag gravada isMaintenanceKpi = classificação central em todos os registros", flagMismatch === 0, `${flagMismatch} divergentes`);

  const tableAll = await getPcFactoryRecords({ onlyWeekendMaintenance: true, pageSize: 25 });
  console.log(`  Tabela "Somente FDS" (sem filtros):        ${tableAll.total.toLocaleString("pt-BR")} registros`);
  check("tabela 'Somente FDS' conta registros FDS (inclui sem término = 0 h, logo mesmo total)", tableAll.total === weekendRecords);
  check(
    "toda linha da tabela FDS tem KPI = Sim e Horas FDS > 0",
    tableAll.data.every((row) => row.isMaintenanceKpi && row.weekendMaintenanceHours > 0)
  );

  console.log("\n=== 2. RANKING ===");
  const all = await loadPage({});
  printRanking("Base inteira", all);

  const august = await loadPage({ startDate: "2026-08-01", endDate: "2026-08-31" });
  printRanking("Agosto/2026", august);

  const machine = await loadPage({ resources: [MACHINE] });
  printRanking(`Máquina = ${MACHINE}`, machine);

  const group = all.criticalResources.find((row) => row.groupPortal)?.groupPortal ?? null;
  const byGroup = group ? await loadPage({ groupPortals: [group] }) : null;
  if (byGroup) printRanking(`Grupo = ${group}`, byGroup);

  console.log("\n=== 3. FILTROS ===");
  const fromAll = all.criticalResources.find((row) => row.resourceName === MACHINE);
  const fromFilter = machine.criticalResources.find((row) => row.resourceName === MACHINE);
  if (fromAll && fromFilter) {
    check(
      `${MACHINE}: FDS filtrando a máquina = FDS no ranking geral`,
      Math.abs(fromAll.weekendMaintenanceHours - fromFilter.weekendMaintenanceHours) < 0.01,
      `${fromAll.weekendMaintenanceHours} × ${fromFilter.weekendMaintenanceHours}`
    );
  } else {
    console.log(`  (${MACHINE} fora do Top 10 da base inteira — comparação pulada)`);
  }
  const augMachine = august.criticalResources.find((row) => row.resourceName === MACHINE);
  if (fromAll && augMachine) {
    check("Recorte de período reduz (ou mantém) o FDS da máquina", augMachine.weekendMaintenanceHours <= fromAll.weekendMaintenanceHours + 0.01);
  }
  const tableMachine = await getPcFactoryRecords({ onlyWeekendMaintenance: true, resources: [MACHINE], pageSize: 100 });
  console.log(`  Tabela "Somente FDS" com máquina = ${MACHINE}: ${tableMachine.total} registros`);
  check("tabela FDS filtrada só traz a máquina filtrada", tableMachine.data.every((row) => row.resourceName === MACHINE));
  const tableAug = await getPcFactoryRecords({ onlyWeekendMaintenance: true, startDate: "2026-08-01", endDate: "2026-08-31", pageSize: 25 });
  console.log(`  Tabela "Somente FDS" em agosto/2026: ${tableAug.total} registros`);
  check("filtro de período reduz a tabela FDS", tableAug.total <= tableAll.total);

  if (snapshotPath) {
    const snapshot = {
      all: stripWeekend(all),
      august: stripWeekend(august),
      machine: stripWeekend(machine),
      group: byGroup ? stripWeekend(byGroup) : null
    };
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    console.log(`\nSnapshot de regressão gravado em ${snapshotPath}`);
  }

  console.log(failures === 0 ? "\nValidação OK." : `\n${failures} verificação(ões) falharam.`);
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

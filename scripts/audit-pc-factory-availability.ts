/**
 * Auditoria da Disponibilidade do PC-Factory (TAREFA 10).
 *
 * Imprime a decomposição oficial (Carga → Operacional → Trabalhado → %) para o período
 * inteiro e por máquina/mês, usando EXATAMENTE a mesma agregação e a mesma função central
 * das telas — então qualquer divergência aqui é a mesma divergência do dashboard.
 *
 * Também valida a classificação dos status citados nos critérios de aceite e verifica
 * ausência de NaN/Infinity.
 *
 * Uso:
 *   npx tsx scripts/audit-pc-factory-availability.ts
 *   npx tsx scripts/audit-pc-factory-availability.ts 2026-02-02 2026-07-31
 *   npx tsx scripts/audit-pc-factory-availability.ts 2026-02-02 2026-07-31 "MAQUINA X"
 */
import { classifyAvailabilityBucket } from "@/utils/pc-factory-normalizer";

// O service usa React `cache()` para deduplicar a carga dentro de um mesmo render. Fora do
// runtime do Next essa API não existe, então instalamos um passthrough ANTES de importar o
// service (import dinâmico dentro de main()). Não altera o cálculo: `cache` só memoiza.
const react = require("react") as { cache?: <T>(fn: T) => T };
if (typeof react.cache !== "function") react.cache = (fn) => fn;

const [startDate, endDate, machine] = process.argv.slice(2);

const CLASSIFICACAO_ESPERADA: Array<[string, string, string]> = [
  ["06120", "Setup - Serrad", "PARADA_PLANEJADA"],
  ["06100", "Setup - PZs", "PARADA_PLANEJADA"],
  ["0320", "Refeição", "PARADA_PLANEJADA"],
  ["0312", "Limpeza de Setor de Trabalho", "PARADA_PLANEJADA"],
  ["0201", "Manutenção Mecânica", "PARADA_NAO_PLANEJADA"],
  ["0202", "Manutenção Elétrica", "PARADA_NAO_PLANEJADA"],
  ["0206", "Manutenção Automação", "PARADA_NAO_PLANEJADA"],
  ["0200", "Aguardando Manutenção", "PARADA_NAO_PLANEJADA"],
  ["0303", "Ausência de Operador", "PARADA_NAO_PLANEJADA"],
  ["0004", "Fora de Turno", "FORA_DE_TURNO"],
  ["0009", "Recurso Não Programado", "RECURSO_NAO_PROGRAMADO"],
  ["0001", "Produção", "PRODUCAO"]
];

function fmt(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 }).padStart(12);
}

async function main() {
  const { getPcFactoryAvailabilityAudit, getPcFactoryDashboardKPIs } = await import("@/services/pc-factory.service");
  const params = { startDate, endDate, resources: machine ? [machine] : undefined };

  console.log("\n=== 1. CLASSIFICAÇÃO POR STATUS (critérios de aceite 2 a 8) ===\n");
  let falhas = 0;
  for (const [code, nome, esperado] of CLASSIFICACAO_ESPERADA) {
    const obtido = classifyAvailabilityBucket(code, nome);
    const ok = obtido === esperado;
    if (!ok) falhas += 1;
    console.log(`${ok ? "OK  " : "FALHA"} ${code.padEnd(6)} ${nome.padEnd(30)} ${obtido}`);
  }
  console.log(`\n${falhas === 0 ? "Todas as classificações conferem." : `${falhas} divergência(s).`}`);

  console.log("\n=== 2. DECOMPOSIÇÃO DO PERÍODO (total) ===\n");
  const kpis = await getPcFactoryDashboardKPIs(params);
  const linhas: Array<[string, number | null]> = [
    ["Tempo Total", kpis.totalHours],
    ["  − Fora de Turno", kpis.outOfShiftHours],
    ["  − Recurso Não Programado", kpis.unscheduledResourceHours],
    ["= Tempo de Carga", kpis.loadHours],
    ["  − Paradas Planejadas", kpis.plannedStopHours],
    ["= Tempo Operacional", kpis.operationalHours],
    ["  − Paradas Não Planejadas", kpis.stoppedHours],
    ["= Tempo Trabalhado", kpis.workedHours]
  ];
  for (const [label, value] of linhas) console.log(`${label.padEnd(30)} ${fmt(value ?? 0)} h`);
  console.log(`${"DISPONIBILIDADE".padEnd(30)} ${String(kpis.availabilityPercent ?? "—").padStart(12)} %`);

  console.log("\n=== 3. CONSISTÊNCIA ARITMÉTICA ===\n");
  const cargaOk = Math.abs(kpis.totalHours - kpis.outOfShiftHours - kpis.unscheduledResourceHours - kpis.loadHours) < 0.5;
  const operOk = Math.abs(kpis.loadHours - kpis.plannedStopHours - kpis.operationalHours) < 0.5;
  const trabOk = Math.abs(kpis.operationalHours - kpis.stoppedHours - kpis.workedHours) < 0.5;
  console.log(`Carga      = Total − ForaTurno − RecNaoProg : ${cargaOk ? "OK" : "FALHA"}`);
  console.log(`Operacional= Carga − Planejadas            : ${operOk ? "OK" : "FALHA"}`);
  console.log(`Trabalhado = Operacional − NaoPlanejadas   : ${trabOk ? "OK" : "FALHA"}`);

  console.log("\n=== 4. NaN / Infinity (critérios 12 e 13) ===\n");
  const numeros = Object.entries(kpis).filter(([, v]) => typeof v === "number") as Array<[string, number]>;
  const ruins = numeros.filter(([, v]) => !Number.isFinite(v));
  console.log(ruins.length === 0 ? `OK — ${numeros.length} campos numéricos, nenhum NaN/Infinity.` : `FALHA: ${JSON.stringify(ruins)}`);

  console.log("\n=== 5. POR MÁQUINA / MÊS (comparar com o Management View) ===\n");
  const audit = await getPcFactoryAvailabilityAudit(params, { byMonth: true });
  console.log(
    `${"Máquina".padEnd(28)}${"Mês".padEnd(9)}${"Carga".padStart(12)}${"Planej".padStart(12)}${"Operac".padStart(12)}${"NaoPlan".padStart(12)}${"Trabalh".padStart(12)}${"Disp%".padStart(9)}`
  );
  for (const row of audit.slice(0, 40)) {
    console.log(
      row.machineName.slice(0, 27).padEnd(28) +
        (row.month ?? "—").padEnd(9) +
        fmt(row.loadHours) +
        fmt(row.plannedStopHours) +
        fmt(row.operationalHours) +
        fmt(row.unplannedStopHours) +
        fmt(row.workedHours) +
        String(row.availabilityPercent ?? "—").padStart(9)
    );
  }
  console.log(`\n${audit.length} linhas no total (exibindo até 40).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));

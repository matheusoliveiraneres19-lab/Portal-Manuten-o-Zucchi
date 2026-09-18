/**
 * TESTE DA FÓRMULA DE DISPONIBILIDADE FÍSICA — puro, sem banco.
 *
 *   npm run test:availability
 *
 * Cobre o exemplo obrigatório da conferência manual (744 h / 128 h → 82,8 %), o
 * cálculo do tempo-calendário para períodos cheios e parciais, o agregado por grupo
 * e todas as invariantes de borda (0 %, 100 %, null, nunca NaN/Infinity).
 */
import {
  calculateFleetPhysicalAvailability,
  calculateMonthHours,
  calculateMonthHoursWithinWindow,
  calculatePeriodHours,
  calculatePhysicalAvailability
} from "../src/utils/pc-factory-physical-availability";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(actual: number | null, expected: number | null, tolerance = 0.05): boolean {
  if (actual === null || expected === null) return actual === expected;
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

console.log("\n=== TEMPO TOTAL DO PERÍODO (calculatePeriodHours) ===");
check("Agosto/2026 inteiro (31 dias) = 744 h", calculatePeriodHours("2026-08-01", "2026-08-31") === 744);
check("Abril/2026 inteiro (30 dias) = 720 h", calculatePeriodHours("2026-04-01", "2026-04-30") === 720);
check("Fevereiro/2026 (28 dias) = 672 h", calculatePeriodHours("2026-02-01", "2026-02-28") === 672);
check("Fevereiro/2024 bissexto (29 dias) = 696 h", calculatePeriodHours("2024-02-01", "2024-02-29") === 696);
check("Filtro parcial 01→10/08 = 240 h", calculatePeriodHours("2026-08-01", "2026-08-10") === 240);
check("Um único dia = 24 h", calculatePeriodHours("2026-08-05", "2026-08-05") === 24);
check("Ano inteiro 2026 = 8.760 h", calculatePeriodHours("2026-01-01", "2026-12-31") === 8760);
check("Período invertido = 0 h", calculatePeriodHours("2026-08-31", "2026-08-01") === 0);
check("Data inválida = 0 h", calculatePeriodHours("nao-e-data", "2026-08-31") === 0);
check(
  "Timestamps reais usam a diferença exata (12 h)",
  calculatePeriodHours(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-01T12:00:00Z")) === 12
);
check(
  "Timestamps reais: 36 h e meia",
  calculatePeriodHours(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-02T12:30:00Z")) === 36.5
);

console.log("\n=== EXEMPLO OBRIGATÓRIO DE VALIDAÇÃO (744 h / 128 h) ===");
const exemplo = calculatePhysicalAvailability({ totalPeriodHours: 744, downtimeHours: 128 });
console.log(
  `  Tempo Total: ${exemplo.totalPeriodHours} h | Paradas: ${exemplo.downtimeHours} h | ` +
    `Disponíveis: ${exemplo.availableHours} h | Disponibilidade: ${exemplo.availabilityPercent?.toFixed(4)} %`
);
check("Horas Disponíveis = 616 h", exemplo.availableHours === 616);
check("Disponibilidade ≈ 82,8 %", eq(exemplo.availabilityPercent, 82.8, 0.05));
check("Precisão interna preservada (82,7957…)", eq(exemplo.availabilityPercent, 82.79569892, 0.0001));
check("Exibição com 1 casa = 82,8%", exemplo.availabilityPercent!.toFixed(1) === "82.8");
check("Exibição sem casas = 83%", exemplo.availabilityPercent!.toFixed(0) === "83");
check("Não sinaliza inconsistência", exemplo.downtimeExceedsPeriod === false);

console.log("\n=== INVARIANTES DE BORDA ===");
const zeroParadas = calculatePhysicalAvailability({ totalPeriodHours: 744, downtimeHours: 0 });
check("Paradas = 0 → 100 %", zeroParadas.availabilityPercent === 100);
check("Paradas = 0 → disponíveis = total", zeroParadas.availableHours === 744);

const tudoParado = calculatePhysicalAvailability({ totalPeriodHours: 744, downtimeHours: 744 });
check("Paradas = Tempo Total → 0 %", tudoParado.availabilityPercent === 0);
check("Paradas = Tempo Total → disponíveis = 0", tudoParado.availableHours === 0);

const semPeriodo = calculatePhysicalAvailability({ totalPeriodHours: 0, downtimeHours: 128 });
check("Tempo Total = 0 → null", semPeriodo.availabilityPercent === null);
const negativo = calculatePhysicalAvailability({ totalPeriodHours: -10, downtimeHours: 5 });
check("Tempo Total negativo → null", negativo.availabilityPercent === null);

const excesso = calculatePhysicalAvailability({ totalPeriodHours: 744, downtimeHours: 900 });
check("Paradas > período → 0 % (não negativo)", excesso.availabilityPercent === 0);
check("Paradas > período → sinaliza inconsistência", excesso.downtimeExceedsPeriod === true);
check("Paradas > período → excedente = 156 h", excesso.excessDowntimeHours === 156);

const naoFinito = calculatePhysicalAvailability({ totalPeriodHours: Number.NaN, downtimeHours: Number.POSITIVE_INFINITY });
check("NaN / Infinity na entrada → null, sem propagar", naoFinito.availabilityPercent === null);
check("Nunca devolve NaN", !Number.isNaN(naoFinito.availabilityPercent ?? 0));

const paradaNegativa = calculatePhysicalAvailability({ totalPeriodHours: 744, downtimeHours: -50 });
check("Paradas negativas viram 0 → 100 %", paradaNegativa.availabilityPercent === 100);

console.log("\n=== A FÓRMULA NÃO USA NADA ALÉM DE PERÍODO E PARADAS ===");
// Mesmos dois números ⇒ mesmo resultado, independentemente de qualquer outro
// indicador (LOADTIME, MTBF, MTTR, MTTA, quebras). Duas chamadas idênticas têm de
// devolver exatamente o mesmo percentual.
const a = calculatePhysicalAvailability({ totalPeriodHours: 744, downtimeHours: 128 });
const b = calculatePhysicalAvailability({ totalPeriodHours: 744, downtimeHours: 128 });
check("Função pura: mesma entrada → mesma saída", a.availabilityPercent === b.availabilityPercent);

console.log("\n=== AGREGADO DE GRUPO (ponderado, nunca média simples) ===");
const grupo = calculateFleetPhysicalAvailability({
  periodHoursPerMachine: 744,
  machineCount: 10,
  downtimeHours: 1100
});
console.log(
  `  744 h × 10 máquinas = ${grupo.totalPeriodHours} h | paradas 1.100 h | ` +
    `disponibilidade ${grupo.availabilityPercent?.toFixed(2)} %`
);
check("Tempo Total do grupo = 7.440 h", grupo.totalPeriodHours === 7440);
check("Disponibilidade do grupo ≈ 85,22 %", eq(grupo.availabilityPercent, 85.215, 0.01));
check("Horas disponíveis do grupo = 6.340 h", grupo.availableHours === 6340);

// Média simples daria outro número: duas máquinas, uma 100 % e outra 0 % com pesos
// diferentes. Ponderado = 1 parada de 744 h em 1.488 h possíveis = 50 %.
const ponderado = calculateFleetPhysicalAvailability({ periodHoursPerMachine: 744, machineCount: 2, downtimeHours: 744 });
check("Ponderado por tempo = 50 % (não média dos percentuais)", eq(ponderado.availabilityPercent, 50, 0.001));

check("Grupo sem máquinas → null", calculateFleetPhysicalAvailability({ periodHoursPerMachine: 744, machineCount: 0, downtimeHours: 0 }).availabilityPercent === null);

console.log("\n=== HORAS-CALENDÁRIO POR MÊS (evolução mensal) ===");
check("Janeiro = 744 h", calculateMonthHours("2026-01") === 744);
check("Fevereiro/2026 = 672 h", calculateMonthHours("2026-02") === 672);
check("Fevereiro/2024 = 696 h", calculateMonthHours("2024-02") === 696);
check("Março = 744 h", calculateMonthHours("2026-03") === 744);
check("Abril = 720 h", calculateMonthHours("2026-04") === 720);
check("Mês inválido = 0 h", calculateMonthHours("2026-13") === 0);

console.log("\n=== MÊS RECORTADO À JANELA DO FILTRO ===");
const janelaCheia = { from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-09-01T00:00:00Z") };
check(
  "Agosto dentro de janela que o cobre = 744 h",
  calculateMonthHoursWithinWindow("2026-08", janelaCheia.from, janelaCheia.to) === 744
);
const janelaParcial = { from: new Date("2026-08-10T00:00:00Z"), to: new Date("2026-09-21T00:00:00Z") };
check(
  "Agosto a partir de 10/08 = 22 dias = 528 h",
  calculateMonthHoursWithinWindow("2026-08", janelaParcial.from, janelaParcial.to) === 528
);
check(
  "Setembro até 21/09 = 20 dias = 480 h",
  calculateMonthHoursWithinWindow("2026-09", janelaParcial.from, janelaParcial.to) === 480
);
check(
  "Mês fora da janela = 0 h",
  calculateMonthHoursWithinWindow("2026-01", janelaParcial.from, janelaParcial.to) === 0
);

console.log(failures === 0 ? "\n✅ Todas as verificações passaram.\n" : `\n❌ ${failures} verificação(ões) falharam.\n`);
process.exit(failures === 0 ? 0 : 1);

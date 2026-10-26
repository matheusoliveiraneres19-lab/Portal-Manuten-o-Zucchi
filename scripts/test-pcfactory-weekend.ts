/**
 * TESTE DA MANUTENÇÃO EM FIM DE SEMANA — puro, sem banco.
 *
 *   npm run test:pc-factory-weekend
 *
 * Calendário America/Sao_Paulo. Cobre a sobreposição exata com sábado/domingo
 * (sexta→sábado, domingo→segunda, sexta→segunda…), a conversão do horário de parede
 * gravado pelo importador, o filtro pela classificação central de manutenção
 * (Produção/Setup não entram) e as invariantes 0 ≤ FDS ≤ total e 0 ≤ % ≤ 100.
 */
import {
  calculateWeekendMaintenanceHours,
  calculateWeekendPercentage,
  pcFactoryMaintenanceWeekendHours,
  pcFactoryRecordWeekendHours,
  pcFactoryWallClockToInstant
} from "../src/utils/pc-factory-weekend";
import { isMaintenanceKpi } from "../src/utils/pc-factory-normalizer";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(actual: number, expected: number, tolerance = 1e-6): boolean {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

/** Instante real de um horário de São Paulo (UTC−3, sem horário de verão desde 2019). */
function sp(iso: string): Date {
  return new Date(`${iso}-03:00`);
}

/** Horário de parede como o importador grava (campos UTC = relógio da planilha). */
function wall(iso: string): Date {
  return new Date(`${iso}Z`);
}

function weekend(startIso: string, endIso: string): number {
  return calculateWeekendMaintenanceHours({ start: sp(startIso), end: sp(endIso), timezone: "America/Sao_Paulo" });
}

// Outubro/2026: sex 16, sáb 17, dom 18, seg 19, ter 20, sex 23.
console.log("\n=== SOBREPOSIÇÃO COM SÁBADO/DOMINGO (calculateWeekendMaintenanceHours) ===");
check("sexta 22:00 → sábado 04:00 = 4 h FDS (de 6 h)", near(weekend("2026-10-16T22:00:00", "2026-10-17T04:00:00"), 4));
check("sábado 08:00 → sábado 18:00 = 10 h", near(weekend("2026-10-17T08:00:00", "2026-10-17T18:00:00"), 10));
check("sábado inteiro 00:00 → domingo 00:00 = 24 h", near(weekend("2026-10-17T00:00:00", "2026-10-18T00:00:00"), 24));
check("sábado 20:00 → domingo 06:00 = 10 h", near(weekend("2026-10-17T20:00:00", "2026-10-18T06:00:00"), 10));
check("domingo 06:00 → domingo 14:00 = 8 h", near(weekend("2026-10-18T06:00:00", "2026-10-18T14:00:00"), 8));
check("domingo 20:00 → segunda 05:00 = 4 h FDS (de 9 h)", near(weekend("2026-10-18T20:00:00", "2026-10-19T05:00:00"), 4));
check("sexta 18:00 → segunda 06:00 = 48 h FDS (de 60 h)", near(weekend("2026-10-16T18:00:00", "2026-10-19T06:00:00"), 48));
check("segunda 08:00 → sexta 17:00 = 0 h", near(weekend("2026-10-19T08:00:00", "2026-10-23T17:00:00"), 0));
check("terça 08:00 → terça 12:00 = 0 h", near(weekend("2026-10-20T08:00:00", "2026-10-20T12:00:00"), 0));
check(
  "poucos minutos cruzando sexta→sábado (23:50 → 00:10) = 10 min",
  near(weekend("2026-10-16T23:50:00", "2026-10-17T00:10:00"), 10 / 60)
);
check(
  "poucos minutos cruzando domingo→segunda (23:55 → 00:05) = 5 min",
  near(weekend("2026-10-18T23:55:00", "2026-10-19T00:05:00"), 5 / 60)
);
check("duração decimal: sábado 10:00 → 12:45 = 2,75 h", near(weekend("2026-10-17T10:00:00", "2026-10-17T12:45:00"), 2.75));
check(
  "duração decimal com segundos: sexta 23:30:00 → sábado 01:15:36 = 1,26 h",
  near(weekend("2026-10-16T23:30:00", "2026-10-17T01:15:36"), 1.26)
);
check(
  "intervalo longo: sexta 12:00 → segunda+7 12:00 = 4 dias de FDS = 96 h",
  near(weekend("2026-10-16T12:00:00", "2026-10-26T12:00:00"), 96)
);
check("intervalo vazio = 0", weekend("2026-10-17T10:00:00", "2026-10-17T10:00:00") === 0);
check("intervalo invertido = 0", weekend("2026-10-18T10:00:00", "2026-10-17T10:00:00") === 0);
check(
  "data inválida = 0",
  calculateWeekendMaintenanceHours({ start: new Date("x"), end: sp("2026-10-17T10:00:00") }) === 0
);

console.log("\n=== INDEPENDE DO TIMEZONE DO SERVIDOR ===");
// Sábado 00:00 em São Paulo é sábado 03:00 UTC. Em UTC puro, sexta 22:00 SP (= sáb 01:00 UTC)
// já seria "sábado" — o cálculo tem de usar o calendário de SP.
check(
  "sexta 21:00 → sexta 23:59 em SP = 0 h (em UTC já seria sábado)",
  near(weekend("2026-10-16T21:00:00", "2026-10-16T23:59:00"), 0)
);
check(
  "mesmo intervalo com timezone UTC dá outro resultado (prova que o fuso é aplicado)",
  !near(calculateWeekendMaintenanceHours({ start: sp("2026-10-16T21:00:00"), end: sp("2026-10-16T23:59:00"), timezone: "UTC" }), 0)
);

console.log("\n=== DATAS GRAVADAS (horário de parede nos campos UTC) ===");
check(
  "wall clock sáb 00:00 vira o instante sáb 03:00 UTC",
  pcFactoryWallClockToInstant(wall("2026-10-17T00:00:00")).toISOString() === "2026-10-17T03:00:00.000Z"
);
check(
  "registro gravado sáb 00:00 → sáb 03:00 = 3 h FDS (não vira sexta)",
  near(
    pcFactoryRecordWeekendHours({ startDateTime: wall("2026-10-17T00:00:00"), endDateTime: wall("2026-10-17T03:00:00"), durationHours: 3 }),
    3
  )
);
check(
  "registro gravado sexta 22:00 → sáb 04:00 (6 h) = 4 h FDS",
  near(
    pcFactoryRecordWeekendHours({ startDateTime: wall("2026-10-16T22:00:00"), endDateTime: wall("2026-10-17T04:00:00"), durationHours: 6 }),
    4
  )
);
check(
  "durationHours menor que o delta: FDS rateado e nunca acima da duração",
  near(
    pcFactoryRecordWeekendHours({ startDateTime: wall("2026-10-16T22:00:00"), endDateTime: wall("2026-10-17T04:00:00"), durationHours: 3 }),
    2
  )
);
check(
  "sem término = 0",
  pcFactoryRecordWeekendHours({ startDateTime: wall("2026-10-17T08:00:00"), endDateTime: null, durationHours: 5 }) === 0
);

console.log("\n=== SÓ MANUTENÇÃO (classificação central isMaintenanceKpi) ===");
const saturday = { startDateTime: wall("2026-10-17T08:00:00"), endDateTime: wall("2026-10-17T10:00:00"), durationHours: 2 };
const cases: Array<[string, number]> = [
  ["Manutenção Mecânica", 2],
  ["Manutenção Elétrica", 2],
  ["Manutenção Automação", 2],
  ["Manutenção Planejada", 2],
  ["Manutenção de Terceiros", 2],
  ["Aguardando Manutenção", 2],
  ["Produção", 0],
  ["Setup", 0],
  ["Setup - Serrad", 0],
  ["Fora de Turno", 0]
];
for (const [status, expected] of cases) {
  const got = pcFactoryMaintenanceWeekendHours({ ...saturday, statusRaw: status });
  check(`${status} no sábado → ${expected} h`, near(got, expected), `obtido ${got}`);
}

console.log("\n=== FIXTURE DE SOMA (Mecânica + Elétrica + Produção) ===");
const fixture = [
  // Mecânica: sexta 22h → sábado 04h = 6 h total / 4 h FDS
  { statusRaw: "Manutenção Mecânica", startDateTime: wall("2026-10-16T22:00:00"), endDateTime: wall("2026-10-17T04:00:00"), durationHours: 6 },
  // Elétrica: sábado 10h → 12h = 2 h total / 2 h FDS
  { statusRaw: "Manutenção Elétrica", startDateTime: wall("2026-10-17T10:00:00"), endDateTime: wall("2026-10-17T12:00:00"), durationHours: 2 },
  // Produção: domingo 08h → 18h = 10 h, mas ENTRA KPI = Não
  { statusRaw: "Produção", startDateTime: wall("2026-10-18T08:00:00"), endDateTime: wall("2026-10-18T18:00:00"), durationHours: 10 }
];
const maintenanceOnly = fixture.filter((r) => isMaintenanceKpi(r.statusRaw));
const totalMaintenance = maintenanceOnly.reduce((sum, r) => sum + r.durationHours, 0);
const weekendTotal = fixture.reduce((sum, r) => sum + pcFactoryMaintenanceWeekendHours(r), 0);
const percent = calculateWeekendPercentage(weekendTotal, totalMaintenance);
check("total manutenção = 8 h", near(totalMaintenance, 8));
check("horas FDS = 6 h (Produção não entra)", near(weekendTotal, 6), `obtido ${weekendTotal}`);
check("percentual FDS = 75%", near(percent, 75), `obtido ${percent}`);

console.log("\n=== INVARIANTES DO PERCENTUAL ===");
check("total 0 → 0%", calculateWeekendPercentage(5, 0) === 0);
check("FDS 0 → 0%", calculateWeekendPercentage(0, 100) === 0);
check("FDS = total → 100%", calculateWeekendPercentage(10, 10) === 100);
check("nunca acima de 100%", calculateWeekendPercentage(12, 10) === 100);
check("NaN → 0%", calculateWeekendPercentage(Number.NaN, 10) === 0);

// Propriedade: para intervalos aleatórios, 0 ≤ FDS ≤ duração e FDS + fora-do-FDS = duração.
let propertyOk = true;
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let i = 0; i < 2000; i += 1) {
  const start = new Date(Date.UTC(2026, 0, 1) + Math.floor(rand() * 300 * 86_400_000));
  const durationHours = Math.round(rand() * 200 * 100) / 100;
  const end = new Date(start.getTime() + durationHours * 3_600_000);
  const fds = pcFactoryRecordWeekendHours({ startDateTime: start, endDateTime: end, durationHours });
  if (!(fds >= 0 && fds <= durationHours + 1e-9)) propertyOk = false;
}
check("2.000 intervalos aleatórios: 0 ≤ FDS ≤ duração", propertyOk);

console.log(failures === 0 ? "\nTodos os testes passaram." : `\n${failures} teste(s) falharam.`);
if (failures > 0) process.exit(1);

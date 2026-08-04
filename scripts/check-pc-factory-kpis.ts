/**
 * Validação dos KPIs de manutenção direto no banco (replica as fórmulas do
 * serviço, sem o cache() do React que só roda no runtime do Next).
 */
import { PcFactoryStatusCategory } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const SETUP_COUNTS_AS_LOSS = true;
const r1 = (v: number) => Math.round(v * 10) / 10;
const h = (v: number | null) => (v === null ? "—" : `${r1(v).toLocaleString("pt-BR")} h`);
const p = (v: number | null) => (v === null ? "—" : `${r1(v).toLocaleString("pt-BR")}%`);

type Rec = { resourceName: string; statusCategory: PcFactoryStatusCategory; durationHours: number; rootCause: string | null };

function aggregate(records: Rec[]) {
  let planned = 0, production = 0, maintenance = 0, setup = 0, parada = 0, events = 0;
  for (const rec of records) {
    const hours = Number.isFinite(rec.durationHours) ? rec.durationHours : 0;
    if (rec.statusCategory === PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO) continue;
    planned += hours;
    if (rec.statusCategory === PcFactoryStatusCategory.MANUTENCAO) { maintenance += hours; events += 1; }
    else if (rec.statusCategory === PcFactoryStatusCategory.PRODUCAO) production += hours;
    else if (rec.statusCategory === PcFactoryStatusCategory.SETUP) setup += hours;
    else if (rec.statusCategory === PcFactoryStatusCategory.PARADA_PERDA) parada += hours;
  }
  const loss = parada + (SETUP_COUNTS_AS_LOSS ? setup : 0);
  const stopped = maintenance + loss;
  return {
    planned, production, maintenance, events, stopped,
    mttr: events > 0 ? maintenance / events : null,
    mtbf: events > 0 ? production / events : null,
    availability: planned > 0 ? Math.min(100, Math.max(0, ((planned - stopped) / planned) * 100)) : null
  };
}

async function main() {
  const records = (await prisma.pcFactoryRecord.findMany({
    select: { resourceName: true, statusCategory: true, durationHours: true, rootCause: true }
  })) as Rec[];

  const g = aggregate(records);
  console.log(`Registros: ${records.length}`);
  console.log("\n===== KPIs GERAIS =====");
  console.log(`Tempo planejado : ${h(g.planned)}  | Produção: ${h(g.production)}`);
  console.log(`Manutenção      : ${h(g.maintenance)} em ${g.events} eventos | Paradas totais: ${h(g.stopped)}`);
  console.log(`MTTR            : ${h(g.mttr)}`);
  console.log(`MTBF            : ${h(g.mtbf)}`);
  console.log(`Disponibilidade : ${p(g.availability)}`);

  console.log("\n===== CONFIABILIDADE POR MÁQUINA (top 8 por horas de manutenção) =====");
  const byResource = new Map<string, Rec[]>();
  for (const rec of records) {
    const list = byResource.get(rec.resourceName);
    if (list) list.push(rec); else byResource.set(rec.resourceName, [rec]);
  }
  const rows = Array.from(byResource.entries())
    .map(([name, list]) => ({ name, ...aggregate(list) }))
    .filter((row) => row.events > 0)
    .sort((a, b) => b.maintenance - a.maintenance)
    .slice(0, 8);
  for (const row of rows) {
    console.log(`${row.name.padEnd(26).slice(0, 26)} | quebras ${String(row.events).padStart(3)} | MTBF ${h(row.mtbf).padStart(10)} | MTTR ${h(row.mttr).padStart(8)} | disp ${p(row.availability).padStart(7)}`);
  }

  console.log("\n===== PARETO DE CAUSAS RAIZ (eventos de manutenção) =====");
  const causes = new Map<string, { hours: number; events: number }>();
  for (const rec of records) {
    if (rec.statusCategory !== PcFactoryStatusCategory.MANUTENCAO) continue;
    const cause = rec.rootCause?.trim() || "Não informada";
    const cur = causes.get(cause) ?? { hours: 0, events: 0 };
    cur.hours += rec.durationHours; cur.events += 1;
    causes.set(cause, cur);
  }
  const sorted = Array.from(causes.entries()).map(([cause, v]) => ({ cause, ...v })).sort((a, b) => b.hours - a.hours);
  const total = sorted.reduce((s, c) => s + c.hours, 0);
  let cum = 0;
  for (const c of sorted) {
    const pct = total > 0 ? (c.hours / total) * 100 : 0;
    cum += pct;
    console.log(`${c.cause.padEnd(26).slice(0, 26)} | ${h(c.hours).padStart(10)} | ${String(c.events).padStart(3)} ev | acum ${p(cum)}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

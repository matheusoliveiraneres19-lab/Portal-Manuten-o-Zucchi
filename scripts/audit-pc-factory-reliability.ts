/**
 * Auditoria do dashboard "Confiabilidade por Máquina" do PC-Factory.
 *
 * Recalcula, DIRETO NO BANCO, os mesmos indicadores que o portal mostra, usando as
 * REGRAS OFICIAIS (replicadas de buildReliabilityByMachine em pc-factory.service.ts,
 * sem o cache() do React que só roda no runtime do Next). Serve para bater máquina a
 * máquina contra a Tabela Gerencial / Management View do PC-Factory.
 *
 * Base de tempo  : durationHours (Tempo Decorrido) — NUNCA realDurationHours.
 * Reparo         : Mecânica + Elétrica + Automação + Terceiros (sem Aguardando/Planejada).
 * Aguardando     : "Aguardando Manutenção" (só MTTA e Paradas).
 * Quebras        : eventos de Mec+Elét+Autom+Terceiros+Aguardando (exclui Planejada).
 * Planejado      : Tempo Decorrido exceto Fora de Turno e Recurso Não Programado.
 * MTBF=(planejado−paradas)/quebras · MTTR=reparo/quebras · MTTA=aguardando/quebras
 * Disponibilidade=(planejado−paradas)/planejado×100.
 *
 * USO (PowerShell):
 *   npx tsx --env-file=.env scripts/audit-pc-factory-reliability.ts
 *   npx tsx --env-file=.env scripts/audit-pc-factory-reliability.ts --top=30
 *   npx tsx --env-file=.env scripts/audit-pc-factory-reliability.ts --start=2026-05-01 --end=2026-05-31
 *   npx tsx --env-file=.env scripts/audit-pc-factory-reliability.ts --group="Indústria Granito"
 *   npx tsx --env-file=.env scripts/audit-pc-factory-reliability.ts --machine="Multifio 04 - BM"
 *   npx tsx --env-file=.env scripts/audit-pc-factory-reliability.ts --machine="Multifio 04 - BM" --compare-real
 *
 * Flags: --start --end --group --line --machine (filtra/destrincha) --top=N --compare-real
 */
import { PcFactoryStatusCategory, PrismaClient, type Prisma } from "@prisma/client";

// Script batch pontual: prefere a conexão DIRETA (DIRECT_URL, porta 5432) ao pooler
// (DATABASE_URL, 6543). O pooler é otimizado para o runtime serverless da Vercel e nem
// sempre é alcançável de uma máquina local. Cai no DATABASE_URL se DIRECT_URL não existir.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
  log: ["error"]
});

/* ---------- CLI ---------- */
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const FILTERS = {
  start: arg("start"),
  end: arg("end"),
  group: arg("group"),
  line: arg("line"),
  machine: arg("machine"),
  top: Number(arg("top") ?? "20"),
  compareReal: hasFlag("compare-real")
};

/* ---------- Helpers (idênticos à formatação da UI) ---------- */
const r1 = (v: number) => Math.round(v * 10) / 10;
const h = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `${r1(v).toLocaleString("pt-BR")} h`);
const p = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `${r1(v).toLocaleString("pt-BR")}%`);
const clampPct = (v: number) => Math.min(100, Math.max(0, v));

/**
 * Classificação do sub-tipo de manutenção — espelha maintenanceKind() do normalizador
 * central (comparação por valor EXATO normalizado, nunca contains). Mantido inline para
 * o script ser auto-suficiente e servir de checagem independente.
 */
function normalize(value: unknown): string {
  return String(value ?? "")
    .replace(/ /g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
type Kind = "MECANICA" | "ELETRICA" | "AUTOMACAO" | "PLANEJADA" | "TERCEIROS" | "AGUARDANDO" | null;
function maintenanceKind(statusRaw: unknown): Kind {
  switch (normalize(statusRaw)) {
    case "manutencao mecanica": return "MECANICA";
    case "manutencao eletrica": return "ELETRICA";
    case "manutencao automacao": return "AUTOMACAO";
    case "manutencao planejada": return "PLANEJADA";
    case "manutencao de terceiros": return "TERCEIROS";
    case "aguardando manutencao": return "AGUARDANDO";
    default: return null;
  }
}

type Rec = {
  resourceName: string;
  resourceCode: string | null;
  productionLine: string | null;
  groupPortal: string | null;
  statusRaw: string | null;
  statusCategory: PcFactoryStatusCategory;
  durationHours: number;
  realDurationHours: number | null;
};

/* ---------- Núcleo: replica buildReliabilityByMachine ---------- */
function reliability(records: Rec[], useReal = false) {
  let planned = 0, production = 0, repair = 0, waiting = 0, planejada = 0;
  let repairEvents = 0, waitingEvents = 0;
  const byKind: Record<string, number> = { MECANICA: 0, ELETRICA: 0, AUTOMACAO: 0, TERCEIROS: 0, PLANEJADA: 0, AGUARDANDO: 0 };

  for (const rec of records) {
    const base = useReal && rec.realDurationHours != null ? rec.realDurationHours : rec.durationHours;
    const hours = Number.isFinite(base) && base > 0 ? base : 0;
    if (rec.statusCategory === PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO) continue; // fora do planejado
    planned += hours;
    if (rec.statusCategory === PcFactoryStatusCategory.PRODUCAO) production += hours;

    const kind = maintenanceKind(rec.statusRaw);
    if (kind) byKind[kind] += hours;
    if (kind === "MECANICA" || kind === "ELETRICA" || kind === "AUTOMACAO" || kind === "TERCEIROS") {
      repair += hours; repairEvents += 1;
    } else if (kind === "AGUARDANDO") {
      waiting += hours; waitingEvents += 1;
    } else if (kind === "PLANEJADA") {
      planejada += hours;
    }
  }

  const failureEvents = repairEvents + waitingEvents;
  const downtime = repair + waiting;
  const operating = Math.max(0, planned - downtime);
  const hasPlanned = planned > 0;

  return {
    planned, production, repair, waiting, planejada, downtime, operating, failureEvents, byKind,
    mtbf: hasPlanned && failureEvents > 0 ? operating / failureEvents : null,
    mttr: failureEvents > 0 && repair > 0 ? repair / failureEvents : null,
    mtta: failureEvents > 0 && waiting > 0 ? waiting / failureEvents : null,
    availability: hasPlanned ? clampPct(((planned - downtime) / planned) * 100) : null,
    issue: !hasPlanned
      ? "SEM TEMPO PLANEJADO"
      : downtime > planned
        ? "PARADAS > PLANEJADO"
        : operating <= 0
          ? "SEM PRODUÇÃO (100% MANUT)"
          : null
  };
}

/* ---------- Where (mesmos filtros da página) ---------- */
function buildWhere(): Prisma.PcFactoryRecordWhereInput {
  const and: Prisma.PcFactoryRecordWhereInput[] = [];
  if (FILTERS.group) and.push({ groupPortal: FILTERS.group });
  if (FILTERS.line) and.push({ productionLine: FILTERS.line });
  if (FILTERS.machine) {
    and.push({ OR: [{ resourceName: { contains: FILTERS.machine, mode: "insensitive" } }, { resourceCode: FILTERS.machine }] });
  }
  if (FILTERS.start || FILTERS.end) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (FILTERS.start) range.gte = new Date(`${FILTERS.start}T00:00:00.000Z`);
    if (FILTERS.end) range.lte = new Date(`${FILTERS.end}T23:59:59.999Z`);
    and.push({ startDateTime: range });
  }
  return and.length ? { AND: and } : {};
}

async function main() {
  const records = (await prisma.pcFactoryRecord.findMany({
    where: buildWhere(),
    select: {
      resourceName: true, resourceCode: true, productionLine: true, groupPortal: true,
      statusRaw: true, statusCategory: true, durationHours: true, realDurationHours: true
    }
  })) as Rec[];

  console.log("\n========================================================================");
  console.log("  AUDITORIA — CONFIABILIDADE POR MÁQUINA (PC-Factory)");
  console.log("  Base: durationHours (Tempo Decorrido) | Regras oficiais do portal");
  const f = [
    FILTERS.start && `início ≥ ${FILTERS.start}`,
    FILTERS.end && `fim ≤ ${FILTERS.end}`,
    FILTERS.group && `grupo="${FILTERS.group}"`,
    FILTERS.line && `linha="${FILTERS.line}"`,
    FILTERS.machine && `máquina~"${FILTERS.machine}"`
  ].filter(Boolean);
  console.log(`  Filtros: ${f.length ? f.join(" · ") : "(nenhum — todo o período importado)"}`);
  console.log(`  Registros carregados: ${records.length.toLocaleString("pt-BR")}`);
  console.log("========================================================================");

  const byResource = new Map<string, Rec[]>();
  for (const rec of records) {
    const list = byResource.get(rec.resourceName);
    if (list) list.push(rec); else byResource.set(rec.resourceName, [rec]);
  }

  const rows = Array.from(byResource.entries())
    .map(([name, list]) => ({ name, ...reliability(list) }))
    .filter((row) => row.failureEvents > 0)
    .sort((a, b) => b.downtime - a.downtime);

  console.log(`\nMáquinas com quebras: ${rows.length} (exibindo top ${Math.min(FILTERS.top, rows.length)} por Paradas)\n`);
  const head =
    "MÁQUINA".padEnd(26) + "QUEBR".padStart(6) + "PLANEJ".padStart(11) + "REPARO".padStart(10) +
    "AGUARD".padStart(9) + "PARADAS".padStart(10) + "MTBF".padStart(11) + "MTTR".padStart(9) +
    "MTTA".padStart(9) + "DISP".padStart(8) + "  AVISO";
  console.log(head);
  console.log("-".repeat(head.length + 6));
  for (const row of rows.slice(0, FILTERS.top)) {
    console.log(
      row.name.padEnd(26).slice(0, 26) +
      String(row.failureEvents).padStart(6) +
      h(row.planned).padStart(11) +
      h(row.repair).padStart(10) +
      h(row.waiting).padStart(9) +
      h(row.downtime).padStart(10) +
      h(row.mtbf).padStart(11) +
      h(row.mttr).padStart(9) +
      h(row.mtta).padStart(9) +
      p(row.availability).padStart(8) +
      (row.issue ? `  ⚠ ${row.issue}` : "")
    );
  }

  // Detalhamento profundo quando uma única máquina é alvo do filtro.
  if (FILTERS.machine && rows.length > 0) {
    for (const [name, list] of Array.from(byResource.entries())) {
      const rel = reliability(list);
      if (rel.failureEvents === 0) continue;
      console.log(`\n------------------------------------------------------------------------`);
      console.log(`  DETALHE: ${name}`);
      console.log(`------------------------------------------------------------------------`);
      console.log(`  Registros: ${list.length} | Tempo planejado: ${h(rel.planned)} | Produção: ${h(rel.production)}`);
      console.log(`  Horas por tipo de manutenção (Tempo Decorrido):`);
      console.log(`    Mecânica   : ${h(rel.byKind.MECANICA)}`);
      console.log(`    Elétrica   : ${h(rel.byKind.ELETRICA)}`);
      console.log(`    Automação  : ${h(rel.byKind.AUTOMACAO)}`);
      console.log(`    Terceiros  : ${h(rel.byKind.TERCEIROS)}`);
      console.log(`    Planejada  : ${h(rel.byKind.PLANEJADA)}  (não conta como quebra)`);
      console.log(`    Aguardando : ${h(rel.byKind.AGUARDANDO)}`);
      console.log(`  Reparo (Mec+Elét+Autom+Terc): ${h(rel.repair)} | Aguardando: ${h(rel.waiting)}`);
      console.log(`  Quebras: ${rel.failureEvents} | Paradas (reparo+aguard): ${h(rel.downtime)} | Operacional: ${h(rel.operating)}`);
      console.log(`  >> MTBF=${h(rel.mtbf)}  MTTR=${h(rel.mttr)}  MTTA=${h(rel.mtta)}  Disponibilidade=${p(rel.availability)}`);
      if (rel.issue) console.log(`  >> AVISO DE QUALIDADE: ${rel.issue}`);

      // Status crus que compõem o tempo (auditoria de classificação).
      const byStatus = new Map<string, { hours: number; cat: string; count: number }>();
      for (const rec of list) {
        const key = (rec.statusRaw ?? "(sem status)").trim();
        const cur = byStatus.get(key) ?? { hours: 0, cat: rec.statusCategory, count: 0 };
        cur.hours += Number.isFinite(rec.durationHours) && rec.durationHours > 0 ? rec.durationHours : 0;
        cur.count += 1;
        byStatus.set(key, cur);
      }
      console.log(`\n  Status crus (statusRaw → categoria | horas | nº registros):`);
      for (const [status, v] of Array.from(byStatus.entries()).sort((a, b) => b[1].hours - a[1].hours)) {
        console.log(`    ${status.padEnd(28).slice(0, 28)} ${v.cat.padEnd(24)} ${h(v.hours).padStart(10)}  (${v.count})`);
      }

      if (FILTERS.compareReal) {
        const real = reliability(list, true);
        console.log(`\n  [COMPARAÇÃO] Se usasse realDurationHours (NÃO é a base oficial):`);
        console.log(`    Reparo: ${h(real.repair)} | Paradas: ${h(real.downtime)} | MTTR: ${h(real.mttr)} | Disp: ${p(real.availability)}`);
        console.log(`    Δ MTTR oficial−real: ${h((rel.mttr ?? 0) - (real.mttr ?? 0))}  (confirma que a base muda o resultado)`);
      }
    }
  }

  console.log("\nLegenda: QUEBR=quebras · PLANEJ=tempo planejado · REPARO=Mec+Elét+Autom+Terc · AGUARD=aguardando · DISP=disponibilidade.");
  console.log("'—' = indicador não aplicável (sem base de tempo / sem reparo / sem aguardando).\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

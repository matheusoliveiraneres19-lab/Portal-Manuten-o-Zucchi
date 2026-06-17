/**
 * Importa colaboradores + horas a partir do relatório SAP de confirmações
 * (arquivo .md com colunas concatenadas). Por padrão roda em DRY-RUN (só
 * relatório). Passe "--commit" para gravar.
 *
 * Uso:
 *   npx tsx scripts/import-team-hours.ts "C:\\caminho\\horas_17.06.md"            (dry-run)
 *   npx tsx scripts/import-team-hours.ts "C:\\caminho\\horas_17.06.md" --commit   (grava)
 *
 * Grava de forma idempotente: TimeEntry desta importação levam observation =
 * MARKER e são apagados/recriados a cada execução (não toca em outros TimeEntry).
 */
import { readFileSync } from "node:fs";
import { CollaboratorArea } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { normalizeNameKey } from "../src/lib/name-normalizer";

const MARKER = "IMPORT:horas_17.06";

const GPM_MAP: Record<string, { area: CollaboratorArea; role: string }> = {
  MEC: { area: CollaboratorArea.MECANICA, role: "Mecânico" },
  ELE: { area: CollaboratorArea.ELETRICA, role: "Eletricista" },
  ELT: { area: CollaboratorArea.ELETRICA, role: "Eletricista" },
  LUB: { area: CollaboratorArea.OUTROS, role: "Lubrificador" },
  USI: { area: CollaboratorArea.OUTROS, role: "Usinagem" },
  AUT: { area: CollaboratorArea.AUTOMACAO, role: "Automação" },
  AUTO: { area: CollaboratorArea.AUTOMACAO, role: "Automação" }
};

const LEAD = /^([A-Za-zÀ-ÿ]+?)(\d{2}\.\d{2}\.\d{4})(\d{2}\.\d{2}\.\d{4})/;
const NAME_HOURS = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{2,}?)(\d+(?:,\d+)?)(-?)H/; // nome + TrabReal (- = estorno)
const SUBTOTAL = /^##\s*\*(\d{2}\.\d{2}\.\d{4})([\d.,]+)H/;

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
function toNumber(token: string): number {
  return Number(token.replace(/\./g, "").replace(",", "."));
}
function toDateUTC(br: string): Date {
  const [d, m, y] = br.split(".").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
function topVote(m: Map<string, number>): string | null {
  let best: string | null = null;
  let bestN = -1;
  for (const [k, n] of Array.from(m.entries())) if (n > bestN) { best = k; bestN = n; }
  return best;
}

type Person = {
  name: string;
  nameKey: string;
  matriculaVotes: Map<string, number>;
  gpmVotes: Map<string, number>;
  totalHours: number;
  records: number;
};

async function main() {
  const filePath = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!filePath) {
    console.error('Informe o caminho do arquivo. Ex.: npx tsx scripts/import-team-hours.ts "C:\\...\\horas_17.06.md"');
    process.exit(1);
  }

  const people = new Map<string, Person>();
  const dailyParsed = new Map<string, number>();
  const dailySubtotal = new Map<string, number>();
  const dayKeyEntries = new Map<string, { userName: string; workDate: Date; hours: number }>();
  const unparsed: string[] = [];

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const sub = line.match(SUBTOTAL);
    if (sub) {
      dailySubtotal.set(sub[1], toNumber(sub[2]));
      continue;
    }
    if (line.startsWith("##") || line.startsWith("Criado por") || !LEAD.test(line)) continue;

    const lead = line.match(LEAD)!;
    const criadoEm = lead[2];
    const nh = line.match(NAME_HOURS);
    if (!nh) {
      unparsed.push(line.slice(0, 90));
      continue;
    }

    const name = nh[1].trim();
    const hours = toNumber(nh[2]) * (nh[3] === "-" ? -1 : 1); // estorno = negativo
    if (!name || name.length < 3 || !Number.isFinite(hours) || hours === 0) {
      unparsed.push(line.slice(0, 90));
      continue;
    }
    const nameKey = normalizeNameKey(name);

    const rest = line.slice((nh.index ?? 0) + nh[0].length);
    const pg = rest.match(/^(\d{1,4})([A-Za-zÀ-ÿ]{2,4})/);

    let person = people.get(nameKey);
    if (!person) {
      person = { name, nameKey, matriculaVotes: new Map(), gpmVotes: new Map(), totalHours: 0, records: 0 };
      people.set(nameKey, person);
    }
    person.totalHours = round(person.totalHours + hours);
    person.records += 1;
    if (pg) {
      person.matriculaVotes.set(pg[1], (person.matriculaVotes.get(pg[1]) ?? 0) + 1);
      const gpm = pg[2].toUpperCase();
      person.gpmVotes.set(gpm, (person.gpmVotes.get(gpm) ?? 0) + 1);
    }

    dailyParsed.set(criadoEm, round((dailyParsed.get(criadoEm) ?? 0) + hours));

    const key = `${nameKey}|${criadoEm}`;
    const entry = dayKeyEntries.get(key);
    if (entry) entry.hours = round(entry.hours + hours);
    else dayKeyEntries.set(key, { userName: name, workDate: toDateUTC(criadoEm), hours });
  }

  const persons = Array.from(people.values()).sort((a, b) => b.totalHours - a.totalHours);
  const totalHours = round(persons.reduce((s, p) => s + p.totalHours, 0));

  console.log(`Arquivo: ${filePath}`);
  console.log(
    `Pessoas: ${persons.length} | Registros: ${persons.reduce((s, p) => s + p.records, 0)} | Horas totais: ${totalHours}`
  );
  console.log(`Lançamentos agregados (pessoa x dia) p/ TimeEntry: ${dayKeyEntries.size}`);
  console.log("\n=== COLABORADORES (matrícula = Nº pess, área = GPM) ===");
  for (const p of persons) {
    const mat = topVote(p.matriculaVotes) ?? "?";
    const gpm = topVote(p.gpmVotes) ?? "";
    const map = GPM_MAP[gpm] ?? { area: CollaboratorArea.OUTROS, role: "—" };
    console.log(
      `${p.name.padEnd(30).slice(0, 30)} | mat ${String(mat).padStart(4)} | ${gpm.padEnd(4)} ${map.area.padEnd(9)} | ${String(p.totalHours).padStart(7)} h | ${p.records} reg`
    );
  }

  console.log("\n=== CONFERÊNCIA POR DIA (criado em): parsed vs subtotal ===");
  for (const [day, sub] of Array.from(dailySubtotal.entries()).sort()) {
    const mine = dailyParsed.get(day) ?? 0;
    const flag = Math.abs(mine - sub) > sub * 0.15 ? "  <-- diferença" : "";
    console.log(`${day}: parsed ${String(mine).padStart(8)} h | subtotal ${String(sub).padStart(8)} h${flag}`);
  }

  if (unparsed.length) {
    console.log(`\n=== LINHAS NÃO INTERPRETADAS (${unparsed.length}) — amostra ===`);
    unparsed.slice(0, 12).forEach((l) => console.log("  " + l));
  }

  if (!commit) {
    console.log("\nDRY-RUN: nada foi gravado. Rode novamente com --commit para inserir.");
    return;
  }

  console.log("\nGravando...");
  let created = 0;
  let updated = 0;
  for (const p of persons) {
    const mat = topVote(p.matriculaVotes);
    const matricula = mat ? `P-${mat}` : `N-${p.nameKey.replace(/\s+/g, "-").slice(0, 18)}`;
    const gpm = topVote(p.gpmVotes) ?? "";
    const map = GPM_MAP[gpm] ?? { area: CollaboratorArea.OUTROS, role: null };
    const result = await prisma.collaborator.upsert({
      where: { matricula },
      update: { name: p.name, nameKey: p.nameKey, area: map.area, role: map.role ?? undefined },
      create: { matricula, name: p.name, nameKey: p.nameKey, area: map.area, role: map.role ?? undefined, monthlyGoal: 220 }
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1;
    else updated += 1;
  }

  const del = await prisma.timeEntry.deleteMany({ where: { observation: MARKER } });
  const entries = Array.from(dayKeyEntries.values()).map((e) => ({ ...e, observation: MARKER }));
  await prisma.timeEntry.createMany({ data: entries });

  console.log(`Colaboradores: ${created} criados, ${updated} atualizados.`);
  console.log(`TimeEntry: ${del.count} antigos (marker) apagados, ${entries.length} inseridos.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

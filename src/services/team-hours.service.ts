/**
 * ETAPA 2 — Banco de horas × colaborador.
 *
 * Compõe (sem alterar) duas fontes já existentes:
 *  - cadastro de colaboradores (tabela Collaborator);
 *  - horas por pessoa no período (time-entries.service: TimeEntry com fallback
 *    em ServiceOrder), reaproveitado integralmente.
 *
 * O elo é o nome normalizado: normalizeNameKey(TimeEntry.userName) == Collaborator.nameKey.
 */
import { prisma } from "@/lib/prisma";
import { normalizeMatriculaKey, normalizeNameKey } from "@/lib/name-normalizer";
import { getHoursByCollaborator } from "@/services/time-entries.service";
import { monthRange, type DateRange } from "@/utils/date-range";
import type { CollaboratorMonthPoint, TeamHoursResult, TeamHoursRow, UnmatchedHoursRow } from "@/types/collaborators";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "");
}

/**
 * Horas apontadas por mês de UM colaborador (reaproveita getHoursByCollaborator
 * por mês — mesma fonte da verdade do banco de horas). `ref` = mês de referência.
 */
export async function getCollaboratorMonthlyHours(
  nameKey: string,
  matriculaKey: string,
  monthsBack: number,
  ref: Date
): Promise<CollaboratorMonthPoint[]> {
  const matricula = normalizeMatriculaKey(matriculaKey);
  const points: CollaboratorMonthPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const first = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - i, 1));
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth() + 1;
    const rows = await getHoursByCollaborator(monthRange(year, month));
    let hours = 0;
    for (const row of rows) {
      const rowMatricula = normalizeMatriculaKey(row.responsibleId);
      // Preferir matrícula; usar o nome só quando a OS não tem matrícula, para
      // não somar a mesma linha duas vezes.
      const matchByMatricula = Boolean(matricula) && rowMatricula === matricula;
      const matchByName = !rowMatricula && normalizeNameKey(row.userName) === nameKey;
      if (matchByMatricula || matchByName) hours = round(hours + row.hours);
    }
    points.push({ ym: `${year}-${String(month).padStart(2, "0")}`, label: monthLabel(first), hours });
  }
  return points;
}

export async function getTeamHours(period: DateRange): Promise<TeamHoursResult> {
  const [collaborators, hoursRows] = await Promise.all([
    prisma.collaborator.findMany({
      select: {
        id: true,
        matricula: true,
        name: true,
        nameKey: true,
        role: true,
        area: true,
        status: true,
        monthlyGoal: true
      },
      orderBy: [{ status: "asc" }, { name: "asc" }]
    }),
    getHoursByCollaborator(period)
  ]);

  // Soma as horas por dois índices: matrícula (preferencial) e nome (fallback).
  // A matrícula (responsibleId da OS) é a chave confiável — o nome do SAP pode
  // divergir do cadastro (ex.: "WALACE NUNES" × "WALACE NUNES DE MATTOS").
  const hoursByKey = new Map<string, number>();
  const hoursByMatricula = new Map<string, number>();
  for (const row of hoursRows) {
    const key = normalizeNameKey(row.userName);
    hoursByKey.set(key, (hoursByKey.get(key) ?? 0) + row.hours);
    const matricula = normalizeMatriculaKey(row.responsibleId);
    if (matricula) {
      hoursByMatricula.set(matricula, (hoursByMatricula.get(matricula) ?? 0) + row.hours);
    }
  }

  const matchedIds = new Set<string>();
  const rows: TeamHoursRow[] = collaborators.map((collaborator) => {
    const matricula = normalizeMatriculaKey(collaborator.matricula);
    const rawHours =
      matricula && hoursByMatricula.has(matricula)
        ? hoursByMatricula.get(matricula)!
        : (hoursByKey.get(collaborator.nameKey) ?? 0);
    const hours = round(rawHours);
    if (hours > 0) matchedIds.add(collaborator.id);
    return {
      id: collaborator.id,
      matricula: collaborator.matricula,
      name: collaborator.name,
      role: collaborator.role,
      area: collaborator.area,
      status: collaborator.status,
      monthlyGoal: collaborator.monthlyGoal,
      hours,
      goalPercent: collaborator.monthlyGoal > 0 ? round((hours / collaborator.monthlyGoal) * 100) : null
    };
  });

  // Apontamentos sem colaborador cadastrado: a OS não casou nem por matrícula
  // (preferencial) nem por nome (fallback).
  const collaboratorNameKeys = new Set(collaborators.map((c) => c.nameKey));
  const collaboratorMatriculas = new Set(
    collaborators.map((c) => normalizeMatriculaKey(c.matricula)).filter(Boolean)
  );
  const unmatchedByKey = new Map<string, UnmatchedHoursRow>();
  for (const row of hoursRows) {
    const key = normalizeNameKey(row.userName);
    const matricula = normalizeMatriculaKey(row.responsibleId);
    if (matricula && collaboratorMatriculas.has(matricula)) continue;
    if (collaboratorNameKeys.has(key)) continue;
    const current = unmatchedByKey.get(key);
    if (current) current.hours = round(current.hours + row.hours);
    else unmatchedByKey.set(key, { userName: row.userName, hours: round(row.hours) });
  }

  const rowsSorted = rows.sort((a, b) => b.hours - a.hours);
  const unmatched = Array.from(unmatchedByKey.values()).sort((a, b) => b.hours - a.hours);

  return {
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    rows: rowsSorted,
    unmatched,
    totalHours: round(rowsSorted.reduce((sum, row) => sum + row.hours, 0)),
    totalGoal: round(collaborators.reduce((sum, c) => sum + c.monthlyGoal, 0)),
    matchedCollaborators: matchedIds.size
  };
}

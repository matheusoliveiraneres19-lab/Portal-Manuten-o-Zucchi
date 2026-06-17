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
import { normalizeNameKey } from "@/lib/name-normalizer";
import { getHoursByCollaborator } from "@/services/time-entries.service";
import type { DateRange } from "@/utils/date-range";
import type { TeamHoursResult, TeamHoursRow, UnmatchedHoursRow } from "@/types/collaborators";

function round(value: number): number {
  return Math.round(value * 100) / 100;
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

  // Soma as horas por chave normalizada (vários userName podem normalizar igual).
  const hoursByKey = new Map<string, number>();
  for (const row of hoursRows) {
    const key = normalizeNameKey(row.userName);
    hoursByKey.set(key, (hoursByKey.get(key) ?? 0) + row.hours);
  }

  const matchedKeys = new Set<string>();
  const rows: TeamHoursRow[] = collaborators.map((collaborator) => {
    const hours = round(hoursByKey.get(collaborator.nameKey) ?? 0);
    if (hours > 0) matchedKeys.add(collaborator.nameKey);
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

  // Apontamentos sem colaborador cadastrado (chave de horas que não casou com nenhum nameKey).
  const collaboratorKeys = new Set(collaborators.map((c) => c.nameKey));
  const unmatchedByKey = new Map<string, UnmatchedHoursRow>();
  for (const row of hoursRows) {
    const key = normalizeNameKey(row.userName);
    if (collaboratorKeys.has(key)) continue;
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
    matchedCollaborators: matchedKeys.size
  };
}

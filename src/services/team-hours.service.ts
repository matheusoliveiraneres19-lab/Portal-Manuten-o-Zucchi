/**
 * ETAPA 2 — Banco de horas × colaborador.
 *
 * Compõe (sem alterar) duas fontes:
 *  - cadastro de colaboradores (tabela Collaborator);
 *  - horas por pessoa no período — FONTE OFICIAL: Ordens de Manutenção
 *    (ServiceOrder.workedHours), via getHoursByCollaborator. Não usa TimeEntry.
 *
 * O elo é a MATRÍCULA (responsibleId da OS, reduzido a dígitos) — chave confiável;
 * o nome normalizado é fallback quando a OS não traz matrícula.
 */
import { prisma } from "@/lib/prisma";
import { normalizeMatriculaKey, normalizeNameKey } from "@/lib/name-normalizer";
import { getHoursByCollaborator, type HoursOsType } from "@/services/time-entries.service";
import { excludeInvalidTestEquipmentWhere, getProgrammedOrderType } from "@/utils/service-order-classification";
import { monthRange, withinPeriod, type DateRange } from "@/utils/date-range";
import type {
  CollaboratorHoursOrdersResult,
  CollaboratorMonthPoint,
  TeamHoursOrderRow,
  TeamHoursOsType,
  TeamHoursResult,
  TeamHoursRow,
  UnmatchedHoursRow
} from "@/types/collaborators";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "");
}

/**
 * Horas apontadas por mês de UM colaborador (reaproveita getHoursByCollaborator
 * por mês — mesma fonte oficial: Ordens de Manutenção). `ref` = mês de referência.
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

export async function getTeamHours(period: DateRange, osType: TeamHoursOsType = "all"): Promise<TeamHoursResult> {
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
    getHoursByCollaborator(period, { osType: osType as HoursOsType })
  ]);

  // Soma horas E nº de OS por dois índices: matrícula (preferencial) e nome
  // (fallback). A matrícula (responsibleId da OS) é a chave confiável — o nome do
  // SAP pode divergir do cadastro (ex.: "WALACE NUNES" × "WALACE NUNES DE MATTOS").
  type Acc = { hours: number; orders: number };
  const byKey = new Map<string, Acc>();
  const byMatricula = new Map<string, Acc>();
  for (const row of hoursRows) {
    const key = normalizeNameKey(row.userName);
    const accKey = byKey.get(key) ?? { hours: 0, orders: 0 };
    accKey.hours += row.hours;
    accKey.orders += row.orders;
    byKey.set(key, accKey);
    const matricula = normalizeMatriculaKey(row.responsibleId);
    if (matricula) {
      const accMat = byMatricula.get(matricula) ?? { hours: 0, orders: 0 };
      accMat.hours += row.hours;
      accMat.orders += row.orders;
      byMatricula.set(matricula, accMat);
    }
  }

  const matchedIds = new Set<string>();
  const rows: TeamHoursRow[] = collaborators.map((collaborator) => {
    const matricula = normalizeMatriculaKey(collaborator.matricula);
    const acc =
      matricula && byMatricula.has(matricula)
        ? byMatricula.get(matricula)!
        : byKey.get(collaborator.nameKey) ?? { hours: 0, orders: 0 };
    const hours = round(acc.hours);
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
      orderCount: acc.orders,
      goalPercent: collaborator.monthlyGoal > 0 ? round((hours / collaborator.monthlyGoal) * 100) : null
    };
  });

  // Apontamentos sem colaborador cadastrado: a OS não casou nem por matrícula
  // (preferencial) nem por nome (fallback). As horas NÃO são perdidas — aparecem
  // aqui para o gestor identificar o gap de cadastro.
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
    osType,
    rows: rowsSorted,
    unmatched,
    totalHours: round(rowsSorted.reduce((sum, row) => sum + row.hours, 0)),
    totalGoal: round(collaborators.reduce((sum, c) => sum + c.monthlyGoal, 0)),
    matchedCollaborators: matchedIds.size
  };
}

/**
 * Drill-down: Ordens de Manutenção que compõem as horas de um colaborador no
 * período. Casa por matrícula (preferencial) e por nome (fallback), aplicando o
 * mesmo filtro osType. Fonte: ServiceOrder.
 */
export async function getCollaboratorHoursOrders(
  collaboratorId: string,
  period: DateRange,
  osType: TeamHoursOsType = "all"
): Promise<CollaboratorHoursOrdersResult | null> {
  const collaborator = await prisma.collaborator.findUnique({
    where: { id: collaboratorId },
    select: { name: true, nameKey: true, matricula: true }
  });
  if (!collaborator) return null;

  const matriculaKey = normalizeMatriculaKey(collaborator.matricula);

  const orders = await prisma.serviceOrder.findMany({
    where: {
      openedAt: withinPeriod(period),
      ...excludeInvalidTestEquipmentWhere()
    },
    select: {
      id: true,
      osNumber: true,
      title: true,
      equipmentName: true,
      status: true,
      openedAt: true,
      closedAt: true,
      workedHours: true,
      planningGroup: true,
      responsibleName: true,
      responsibleId: true
    },
    orderBy: { openedAt: "desc" }
  });

  const rows: TeamHoursOrderRow[] = [];
  let totalHours = 0;

  for (const order of orders) {
    // Casamento: matrícula (preferencial) OU nome (quando a OS não tem matrícula).
    const rowMatricula = normalizeMatriculaKey(order.responsibleId);
    const matchByMatricula = Boolean(matriculaKey) && rowMatricula === matriculaKey;
    const matchByName = !rowMatricula && normalizeNameKey(order.responsibleName) === collaborator.nameKey;
    if (!matchByMatricula && !matchByName) continue;

    const programmed = getProgrammedOrderType(order); // "PL" | "PV" | null
    if (osType === "preventive" && !programmed) continue;
    if (osType === "corrective" && programmed) continue;

    const hours = Number(order.workedHours ?? 0);
    const safe = Number.isFinite(hours) && hours > 0 ? Number(hours.toFixed(2)) : 0;
    totalHours += safe;

    rows.push({
      id: order.id,
      osNumber: order.osNumber,
      title: order.title,
      equipmentName: order.equipmentName,
      status: order.status,
      openedAt: order.openedAt?.toISOString() ?? null,
      closedAt: order.closedAt?.toISOString() ?? null,
      workedHours: safe,
      osType: programmed ?? "Corretiva",
      planningGroup: order.planningGroup
    });
  }

  // Ordena por horas (maior primeiro), depois por data de abertura.
  rows.sort((a, b) => b.workedHours - a.workedHours || (b.openedAt ?? "").localeCompare(a.openedAt ?? ""));

  return {
    collaboratorName: collaborator.name,
    matricula: collaborator.matricula,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    totalHours: round(totalHours),
    orders: rows
  };
}

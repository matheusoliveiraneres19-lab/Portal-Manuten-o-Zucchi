import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth-guard";
import { normalizeNameKey } from "@/lib/name-normalizer";
import { getCollaboratorById } from "@/services/collaborators.service";
import { getCollaboratorMonthlyHours } from "@/services/team-hours.service";
import { listAttachments, listEpis, listTools } from "@/services/collaborator-assets.service";
import { CollaboratorDetailPage } from "@/components/team/CollaboratorDetailPage";
import type { CollaboratorDetailData } from "@/types/collaborators";

export const dynamic = "force-dynamic";

const MONTHS_BACK = 6;
const DAY_MS = 86_400_000;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate(), 0, 0, 0, 0));
}
function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}
function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export default async function CollaboratorDetailRoute({ params }: { params: { id: string } }) {
  const collaborator = await getCollaboratorById(params.id);
  if (!collaborator) notFound();

  const now = new Date();
  const nameKey = normalizeNameKey(collaborator.name);
  const monthly = await getCollaboratorMonthlyHours(nameKey, MONTHS_BACK, now);

  const goal = collaborator.monthlyGoal;
  const currentYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const currentMonthHours = monthly.find((m) => m.ym === currentYm)?.hours ?? 0;
  const withData = monthly.filter((m) => m.hours > 0);
  const accumulatedBalance = round(withData.reduce((sum, m) => sum + (m.hours - goal), 0));

  // Férias: período aquisitivo (12 meses) + limite legal de gozo (12 meses após o fim).
  const acqStart = collaborator.acquisitionPeriodStart
    ? new Date(collaborator.acquisitionPeriodStart)
    : collaborator.admissionDate
      ? new Date(collaborator.admissionDate)
      : null;
  const acqEnd = acqStart ? addMonths(acqStart, 12) : null;
  const legalLimit = acqEnd ? addMonths(acqEnd, 12) : null;
  const vacStart = collaborator.vacationStartDate ? new Date(collaborator.vacationStartDate) : null;
  const daysToVacation = vacStart ? daysBetween(now, vacStart) : null;
  const daysToLegalLimit = legalLimit ? daysBetween(now, legalLimit) : null;
  const expiringSoon =
    legalLimit !== null &&
    daysToLegalLimit !== null &&
    daysToLegalLimit <= 60 &&
    (vacStart === null || vacStart.getTime() > legalLimit.getTime());

  const session = await getSession();
  const canManageAssets = session?.role === "ADMIN" || session?.role === "GESTOR";
  const canEditVacation = canManageAssets;

  // EPIs e ferramentas: visíveis a qualquer sessão. Anexos: só ADMIN/GESTOR.
  const [epis, tools, attachments] = await Promise.all([
    listEpis(params.id, now),
    listTools(params.id),
    canManageAssets ? listAttachments(params.id) : Promise.resolve([])
  ]);

  const data: CollaboratorDetailData = {
    collaborator,
    monthly,
    currentMonthHours,
    monthBalance: round(currentMonthHours - goal),
    accumulatedBalance,
    normalHours: round(Math.min(currentMonthHours, goal)),
    extraHours: round(Math.max(0, currentMonthHours - goal)),
    missingHours: round(Math.max(0, goal - currentMonthHours)),
    vacation: {
      admissionDate: collaborator.admissionDate,
      vacationStartDate: collaborator.vacationStartDate,
      acquisitionPeriodStart: iso(acqStart),
      acquisitionPeriodEnd: iso(acqEnd),
      legalLimit: iso(legalLimit),
      daysToVacation,
      daysToLegalLimit,
      expiringSoon
    },
    epis,
    tools,
    attachments,
    canEditVacation,
    canManageAssets
  };

  return <CollaboratorDetailPage data={data} />;
}

import { CollaboratorsPage } from "@/components/team/CollaboratorsPage";
import { WorkforceAnalysis } from "@/components/team/WorkforceAnalysis";
import { getCollaboratorStats, listCollaborators } from "@/services/collaborators.service";
import { getWorkforcePageData } from "@/services/workforce.service";
import { formatPeriodRange } from "@/utils/period";

export const dynamic = "force-dynamic";

type RouteProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

/**
 * EQUIPE DE MANUTENÇÃO.
 *
 * Duas seções: o CADASTRO (que já existia — criar, editar, função, área, turno,
 * status) e, abaixo, a CARGA DE TRABALHO derivada das Ordens de Manutenção. A segunda
 * não é um controle manual de horas: ela só lê `ServiceOrder.workedHours`, então não
 * existe nada para o time preencher aqui e não há um segundo número concorrendo com o
 * da aba de Ordens.
 */
export default async function EquipeManutencaoRoute({ searchParams = {} }: RouteProps) {
  const startDate = firstParam(searchParams.startDate);
  const endDate = firstParam(searchParams.endDate);

  const [initial, stats, workforce] = await Promise.all([
    listCollaborators({ page: 1, pageSize: 20 }),
    getCollaboratorStats(),
    getWorkforcePageData({ startDate, endDate })
  ]);

  const periodLabel =
    startDate && endDate ? formatPeriodRange(startDate, endDate) : "todo o histórico importado";

  return (
    <div className="space-y-6">
      <CollaboratorsPage initial={initial} stats={stats} />
      <WorkforceAnalysis data={workforce} periodLabel={periodLabel} />
    </div>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() ? raw.trim() : undefined;
}

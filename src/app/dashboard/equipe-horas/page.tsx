import { CollaboratorsPage } from "@/components/team/CollaboratorsPage";
import { listCollaborators } from "@/services/collaborators.service";
import { getTeamHours } from "@/services/team-hours.service";
import { monthRange } from "@/utils/date-range";

export const dynamic = "force-dynamic";

export default async function EquipeHorasRoute() {
  const now = new Date();
  const [initial, initialHours] = await Promise.all([
    listCollaborators({ page: 1, pageSize: 20 }),
    getTeamHours(monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1))
  ]);

  return <CollaboratorsPage initial={initial} initialHours={initialHours} />;
}

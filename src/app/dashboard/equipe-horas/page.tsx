import { CollaboratorsPage } from "@/components/team/CollaboratorsPage";
import { getCollaboratorStats, listCollaborators } from "@/services/collaborators.service";

export const dynamic = "force-dynamic";

export default async function EquipeManutencaoRoute() {
  const [initial, stats] = await Promise.all([
    listCollaborators({ page: 1, pageSize: 20 }),
    getCollaboratorStats()
  ]);

  return <CollaboratorsPage initial={initial} stats={stats} />;
}

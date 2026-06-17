import { CollaboratorsPage } from "@/components/team/CollaboratorsPage";
import { listCollaborators } from "@/services/collaborators.service";

export const dynamic = "force-dynamic";

export default async function EquipeHorasRoute() {
  const initial = await listCollaborators({ page: 1, pageSize: 20 });
  return <CollaboratorsPage initial={initial} />;
}

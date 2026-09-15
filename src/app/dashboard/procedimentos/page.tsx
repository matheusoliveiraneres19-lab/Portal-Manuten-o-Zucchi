import type { Metadata } from "next";
import { ProceduresCenter } from "@/components/procedures/ProceduresCenter";
import { getProceduresCenterData } from "@/services/procedures.service";
import { getTrainingOverview } from "@/services/training.service";
import { getSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Central de Procedimentos | Portal de Gestão da Manutenção Zucchi"
};

export default async function ProcedimentosPage() {
  const session = await getSession();
  // A Central é do USUÁRIO logado (favoritos, trilha, leituras dele); a visão de
  // treinamento é da EQUIPE. As duas carregam juntas, mas medem coisas diferentes —
  // confundir as duas foi o que produziu o "0%" sem explicação.
  const [data, training] = await Promise.all([
    getProceduresCenterData(session?.sub ?? null),
    getTrainingOverview()
  ]);
  const canManage = session?.role === "ADMIN" || session?.role === "GESTOR";
  return <ProceduresCenter data={data} canManage={canManage} training={training} />;
}

import type { Metadata } from "next";
import { ProceduresCenter } from "@/components/procedures/ProceduresCenter";
import { getProceduresCenterData } from "@/services/procedures.service";
import { getSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Central de Procedimentos | Portal de Gestão da Manutenção Zucchi"
};

export default async function ProcedimentosPage() {
  const session = await getSession();
  const data = await getProceduresCenterData(session?.sub ?? null);
  const canManage = session?.role === "ADMIN" || session?.role === "GESTOR";
  return <ProceduresCenter data={data} canManage={canManage} />;
}

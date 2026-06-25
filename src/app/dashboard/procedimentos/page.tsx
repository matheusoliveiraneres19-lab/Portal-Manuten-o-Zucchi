import type { Metadata } from "next";
import { ProceduresCenter } from "@/components/procedures/ProceduresCenter";

export const metadata: Metadata = {
  title: "Central de Procedimentos | Portal de Gestão da Manutenção Zucchi"
};

export default function ProcedimentosPage() {
  return <ProceduresCenter />;
}

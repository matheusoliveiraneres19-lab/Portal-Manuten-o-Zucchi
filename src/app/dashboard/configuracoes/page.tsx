import { ConfiguracoesPage } from "@/components/configuracoes/ConfiguracoesPage";

export const dynamic = "force-dynamic";

// Fase 01: apenas o layout administrativo. Dados reais (última importação,
// usuários, alertas) e CRUD das regras entram nas próximas fases.
export default function ConfiguracoesRoute() {
  return <ConfiguracoesPage />;
}

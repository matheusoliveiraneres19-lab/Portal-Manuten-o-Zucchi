import { notFound } from "next/navigation";
import { ModulePlaceholder } from "@/components/dashboard/ModulePlaceholder";

const modules = {
  "ordens-servico": {
    title: "Ordens de Serviço",
    description: "Acompanhe solicitações, prioridades, execução e encerramento das ordens de serviço."
  },
  "materiais-utilizados": {
    title: "Materiais Utilizados",
    description: "Visualize o consumo de materiais por período, equipamento e tipo de manutenção."
  },
  lubrificantes: {
    title: "Lubrificantes",
    description: "Controle consumo, estoque e aplicações de lubrificantes nos equipamentos críticos."
  },
  "equipamentos-criticos": {
    title: "Equipamentos Críticos",
    description: "Priorize ativos estratégicos, criticidade operacional e riscos de parada."
  },
  alertas: {
    title: "Alertas",
    description: "Centralize alertas operacionais e eventos relevantes da manutenção."
  },
  procedimentos: {
    title: "Procedimentos",
    description: "Organize procedimentos técnicos, instruções operacionais e documentos de referência."
  },
  "equipe-horas": {
    title: "Equipe de Manutenção",
    description: "Gerencie o cadastro dos colaboradores da manutenção, suas áreas, funções, matrículas e status."
  }
} as const;

type ModuleSlug = keyof typeof modules;

type ModulePageProps = {
  params: {
    module: string;
  };
};

export default function ModulePage({ params }: ModulePageProps) {
  const moduleConfig = modules[params.module as ModuleSlug];

  if (!moduleConfig) {
    notFound();
  }

  return <ModulePlaceholder title={moduleConfig.title} description={moduleConfig.description} />;
}

import {
  ClipboardList,
  Droplet,
  Factory,
  GraduationCap,
  MonitorSmartphone,
  ShieldCheck,
  Wrench,
  Zap,
  type LucideIcon
} from "lucide-react";

/**
 * Dados LOCAIS TEMPORÁRIOS da "Central de Procedimentos" (fase 01 — apenas visual).
 * Não há banco, CRUD nem upload nesta fase. Na fase 02 estes arrays serão substituídos
 * por dados reais (Prisma/Supabase) mantendo os mesmos tipos.
 */

export type ProcedureLevel = "Básico" | "Intermediário" | "Avançado";

export type ProcedureCategorySlug =
  | "funcionario-novo"
  | "sap-fiori"
  | "pc-factory"
  | "ordem-servico"
  | "seguranca"
  | "mecanica"
  | "eletrica"
  | "lubrificacao";

export type ProcedureCategory = {
  slug: ProcedureCategorySlug;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Quantidade temporária de procedimentos (placeholder visual da fase 01). */
  count: number;
};

export const PROCEDURE_CATEGORIES: ProcedureCategory[] = [
  {
    slug: "funcionario-novo",
    name: "Funcionário Novo",
    description: "Primeiros passos para entender a rotina da manutenção.",
    icon: GraduationCap,
    count: 4
  },
  {
    slug: "sap-fiori",
    name: "SAP/Fiori",
    description: "Guias rápidos para apontamento, consulta e fechamento de ordens.",
    icon: MonitorSmartphone,
    count: 6
  },
  {
    slug: "pc-factory",
    name: "PC-Factory",
    description: "Padrões de status, apontamentos e interpretação de paradas.",
    icon: Factory,
    count: 8
  },
  {
    slug: "ordem-servico",
    name: "Ordem de Serviço",
    description: "Como atender, descrever, registrar e finalizar serviços.",
    icon: ClipboardList,
    count: 7
  },
  {
    slug: "seguranca",
    name: "Segurança",
    description: "Orientações para bloqueio, EPI, liberação e intervenção segura.",
    icon: ShieldCheck,
    count: 5
  },
  {
    slug: "mecanica",
    name: "Mecânica",
    description: "Procedimentos práticos para manutenção mecânica do dia a dia.",
    icon: Wrench,
    count: 9
  },
  {
    slug: "eletrica",
    name: "Elétrica",
    description: "Procedimentos práticos para manutenção elétrica do dia a dia.",
    icon: Zap,
    count: 6
  },
  {
    slug: "lubrificacao",
    name: "Lubrificação",
    description: "Rotinas de lubrificação, óleo, graxa, filtragem e consumo.",
    icon: Droplet,
    count: 4
  }
];

export const CATEGORY_BY_SLUG: Record<ProcedureCategorySlug, ProcedureCategory> = Object.fromEntries(
  PROCEDURE_CATEGORIES.map((category) => [category.slug, category])
) as Record<ProcedureCategorySlug, ProcedureCategory>;

export type Procedure = {
  id: string;
  title: string;
  categorySlug: ProcedureCategorySlug;
  level: ProcedureLevel;
  /** Tempo estimado de leitura, em minutos. */
  readingMinutes: number;
  /** Público indicado (ex.: "Mecânicos, Eletricistas e Lubrificadores"). */
  audience: string;
  /** Responsável pelo conteúdo (placeholder da fase 01). */
  responsible: string;
  /** Última atualização (texto pt-BR — placeholder da fase 01). */
  updatedAt: string;
  /** Destaca na seção "Mais acessados". */
  popular: boolean;
  /** Termos auxiliares para a busca (sinônimos, siglas). */
  tags: string[];
};

export const PROCEDURES: Procedure[] = [
  {
    id: "apontar-horas-sap-fiori",
    title: "Como apontar horas no SAP Fiori",
    categorySlug: "sap-fiori",
    level: "Básico",
    readingMinutes: 3,
    audience: "Mecânicos, Eletricistas e Lubrificadores",
    responsible: "PCM",
    updatedAt: "20/06/2026",
    popular: true,
    tags: ["apontar horas", "apontamento", "sap", "fiori", "hora", "lançamento"]
  },
  {
    id: "fechar-ordem-manutencao",
    title: "Como fechar uma ordem de manutenção",
    categorySlug: "ordem-servico",
    level: "Básico",
    readingMinutes: 4,
    audience: "Mecânicos e Eletricistas",
    responsible: "PCM",
    updatedAt: "18/06/2026",
    popular: true,
    tags: ["fechar", "encerrar", "finalizar", "os", "ordem de serviço", "ordem"]
  },
  {
    id: "aguardando-manutencao-pc-factory",
    title: "Quando usar Aguardando Manutenção no PC-Factory",
    categorySlug: "pc-factory",
    level: "Intermediário",
    readingMinutes: 5,
    audience: "Operadores e Manutentores",
    responsible: "Engenharia de Manutenção",
    updatedAt: "22/06/2026",
    popular: true,
    tags: ["aguardando manutenção", "pc-factory", "status", "parada", "espera"]
  },
  {
    id: "alterar-status-pc-factory",
    title: "Como alterar status no PC-Factory",
    categorySlug: "pc-factory",
    level: "Básico",
    readingMinutes: 3,
    audience: "Operadores e Manutentores",
    responsible: "Engenharia de Manutenção",
    updatedAt: "22/06/2026",
    popular: true,
    tags: ["alterar status", "pc-factory", "status", "recurso"]
  },
  {
    id: "preencher-descricao-os",
    title: "Como preencher a descrição de uma OS",
    categorySlug: "ordem-servico",
    level: "Básico",
    readingMinutes: 4,
    audience: "Mecânicos e Eletricistas",
    responsible: "PCM",
    updatedAt: "17/06/2026",
    popular: true,
    tags: ["descrição", "preencher", "os", "ordem de serviço", "relato"]
  },
  {
    id: "consultar-historico-equipamento",
    title: "Como consultar histórico de equipamento",
    categorySlug: "sap-fiori",
    level: "Intermediário",
    readingMinutes: 4,
    audience: "Manutentores e Planejadores",
    responsible: "PCM",
    updatedAt: "15/06/2026",
    popular: false,
    tags: ["histórico", "equipamento", "sap", "consulta", "ativo"]
  },
  {
    id: "status-manutencao-mecanica",
    title: "Como alterar status para Manutenção Mecânica",
    categorySlug: "pc-factory",
    level: "Básico",
    readingMinutes: 2,
    audience: "Mecânicos",
    responsible: "Engenharia de Manutenção",
    updatedAt: "21/06/2026",
    popular: false,
    tags: ["status", "manutenção mecânica", "pc-factory", "mecânica"]
  },
  {
    id: "status-manutencao-eletrica",
    title: "Como alterar status para Manutenção Elétrica",
    categorySlug: "pc-factory",
    level: "Básico",
    readingMinutes: 2,
    audience: "Eletricistas",
    responsible: "Engenharia de Manutenção",
    updatedAt: "21/06/2026",
    popular: false,
    tags: ["status", "manutenção elétrica", "pc-factory", "elétrica"]
  },
  {
    id: "solicitar-material-manutencao",
    title: "Como solicitar material para manutenção",
    categorySlug: "ordem-servico",
    level: "Intermediário",
    readingMinutes: 5,
    audience: "Mecânicos e Eletricistas",
    responsible: "Suprimentos",
    updatedAt: "12/06/2026",
    popular: false,
    tags: ["material", "solicitar", "requisição", "compra", "os"]
  },
  {
    id: "bloqueio-antes-intervencao",
    title: "Como fazer bloqueio antes da intervenção",
    categorySlug: "seguranca",
    level: "Avançado",
    readingMinutes: 6,
    audience: "Toda a equipe de manutenção",
    responsible: "SESMT",
    updatedAt: "10/06/2026",
    popular: false,
    tags: ["bloqueio", "loto", "segurança", "elétrico", "energia", "intervenção", "lockout"]
  },
  {
    id: "registrar-consumo-lubrificante",
    title: "Como registrar consumo de lubrificante",
    categorySlug: "lubrificacao",
    level: "Básico",
    readingMinutes: 4,
    audience: "Lubrificadores",
    responsible: "PCM",
    updatedAt: "14/06/2026",
    popular: false,
    tags: ["lubrificação", "óleo", "graxa", "consumo", "registrar"]
  },
  {
    id: "fluxo-da-manutencao",
    title: "Conheça o fluxo da manutenção",
    categorySlug: "funcionario-novo",
    level: "Básico",
    readingMinutes: 5,
    audience: "Funcionários novos",
    responsible: "Engenharia de Manutenção",
    updatedAt: "08/06/2026",
    popular: false,
    tags: ["funcionário novo", "fluxo", "introdução", "rotina", "onboarding"]
  }
];

export type OnboardingStep = {
  order: number;
  title: string;
};

/** Trilha "Primeiros passos para funcionário novo". */
export const ONBOARDING_TRAIL: OnboardingStep[] = [
  { order: 1, title: "Conheça o fluxo da manutenção" },
  { order: 2, title: "Como receber uma OS" },
  { order: 3, title: "Como executar e registrar o serviço" },
  { order: 4, title: "Como apontar horas no SAP" },
  { order: 5, title: "Como alterar status no PC-Factory" },
  { order: 6, title: "Como finalizar a OS" },
  { order: 7, title: "Regras básicas de segurança" }
];

/**
 * Metadados das categorias da Central de Procedimentos. SEM dependência de React/Prisma
 * para poder ser importado tanto no client quanto no server. Os ícones (lucide) são
 * mapeados no client por nome de categoria.
 */

export const PROCEDURE_CATEGORY_NAMES = [
  "Funcionário Novo",
  "SAP/Fiori",
  "PC-Factory",
  "Ordem de Serviço",
  "Segurança",
  "Mecânica",
  "Elétrica",
  "Lubrificação"
] as const;

export type ProcedureCategoryName = (typeof PROCEDURE_CATEGORY_NAMES)[number];

export type ProcedureCategoryMeta = {
  name: ProcedureCategoryName;
  description: string;
};

export const PROCEDURE_CATEGORY_META: ProcedureCategoryMeta[] = [
  { name: "Funcionário Novo", description: "Primeiros passos para entender a rotina da manutenção." },
  { name: "SAP/Fiori", description: "Guias rápidos para apontamento, consulta e fechamento de ordens." },
  { name: "PC-Factory", description: "Padrões de status, apontamentos e interpretação de paradas." },
  { name: "Ordem de Serviço", description: "Como atender, descrever, registrar e finalizar serviços." },
  { name: "Segurança", description: "Orientações para bloqueio, EPI, liberação e intervenção segura." },
  { name: "Mecânica", description: "Procedimentos práticos para manutenção mecânica do dia a dia." },
  { name: "Elétrica", description: "Procedimentos práticos para manutenção elétrica do dia a dia." },
  { name: "Lubrificação", description: "Rotinas de lubrificação, óleo, graxa, filtragem e consumo." }
];

export const PROCEDURE_LEVELS = ["Básico", "Intermediário", "Avançado"] as const;
export type ProcedureLevel = (typeof PROCEDURE_LEVELS)[number];

export const PROCEDURE_STATUSES = ["Publicado", "Rascunho", "Em Revisão", "Arquivado"] as const;
export type ProcedureStatus = (typeof PROCEDURE_STATUSES)[number];

/** Papéis autorizados a criar/editar/arquivar/anexar procedimentos. */
export const PROCEDURE_WRITE_ROLES: string[] = ["ADMIN", "GESTOR"];

export function isProcedureCategoryName(value: unknown): value is ProcedureCategoryName {
  return typeof value === "string" && (PROCEDURE_CATEGORY_NAMES as readonly string[]).includes(value);
}

export function isProcedureLevel(value: unknown): value is ProcedureLevel {
  return typeof value === "string" && (PROCEDURE_LEVELS as readonly string[]).includes(value);
}

export function isProcedureStatus(value: unknown): value is ProcedureStatus {
  return typeof value === "string" && (PROCEDURE_STATUSES as readonly string[]).includes(value);
}

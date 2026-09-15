import type { DataQualitySummary } from "@/types/data-quality";

/**
 * EQUIPE DE MANUTENÇÃO — visão de carga de trabalho.
 *
 * Fonte ÚNICA de horas: `ServiceOrder.workedHours`, agregado por responsável. Não
 * existe apontamento manual nem snapshot aqui — se existisse, a página teria dois
 * números para a mesma pergunta e o gestor não saberia qual cobrar.
 */

/** Recorte da análise: o mesmo período do resto do portal. */
export type WorkforceQueryParams = {
  startDate?: string;
  endDate?: string;
};

/** Um colaborador na visão de carga, já com o cadastro casado quando existe. */
export type WorkforceMemberRow = {
  /** Chave canônica do nome (agrupa variações de grafia). */
  key: string;
  /** Nome para exibição — do cadastro quando casou, senão o da OS. */
  name: string;
  /** Dados do cadastro de colaboradores; null quando o responsável não está cadastrado. */
  role: string | null;
  area: string | null;
  shift: string | null;
  status: string | null;
  /** true quando o nome da OS não tem colaborador correspondente no cadastro. */
  unregistered: boolean;

  workedHours: number;
  totalOrders: number;
  openOrders: number;
  closedOrders: number;
  /** workedHours / totalOrders. null sem OS. */
  averageHoursPerOrder: number | null;
};

/** Esforço da equipe concentrado num equipamento. */
export type WorkforceEquipmentRow = {
  equipment: string;
  workedHours: number;
  totalOrders: number;
  /** Até três responsáveis com mais horas nesse equipamento. */
  topResponsibles: string[];
};

export type WorkforceKpis = {
  activeCollaborators: number;
  workedHours: number;
  /** OS com workedHours > 0 — as que efetivamente têm apontamento. */
  ordersWithHours: number;
  /** workedHours ÷ colaboradores com alguma hora no período. null quando não há. */
  averageHoursPerCollaborator: number | null;
  topByHours: { name: string; value: number } | null;
  topByOrders: { name: string; value: number } | null;
};

export type WorkforcePageData = {
  period: { startDate: string; endDate: string };
  kpis: WorkforceKpis;
  members: WorkforceMemberRow[];
  equipmentEffort: WorkforceEquipmentRow[];
  dataQuality: DataQualitySummary;
  source: "database" | "empty";
};

/** Detalhe de um colaborador (painel lateral), no MESMO recorte da tela. */
export type WorkforceMemberDetail = {
  member: WorkforceMemberRow;
  topEquipments: WorkforceEquipmentRow[];
  orders: Array<{
    id: string;
    osNumber: string;
    title: string;
    status: string;
    equipment: string;
    openedAt: string | null;
    closedAt: string | null;
    workedHours: number;
  }>;
  /** Total de OS do colaborador no recorte (a lista acima é paginada). */
  totalOrders: number;
  periodLabel: string;
};

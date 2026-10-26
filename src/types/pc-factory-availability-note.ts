/**
 * JUSTIFICATIVA DE BAIXA DISPONIBILIDADE — contrato server ↔ client.
 *
 * Informação GERENCIAL. Nada aqui entra em Disponibilidade Física, Horas de
 * Parada, Tempo Total, MTBF, MTTR ou MTTA: esses números continuam vindo
 * exclusivamente de `PcFactoryRecord` pelo service central. Uma justificativa
 * explica o número, nunca o altera.
 *
 * Este arquivo não importa `@prisma/client` de propósito — ele é consumido por
 * Client Components, e arrastar o Prisma Client para o bundle do navegador é o
 * problema que `@/types/audit` já documenta.
 */

/**
 * Quem pode CRIAR/EDITAR justificativa. Reaproveita os papéis que já existem no
 * enum `Role` do banco (ADMIN, GESTOR, TECNICO, COMPRAS, VISUALIZADOR) e o mesmo
 * par que a Central de Procedimentos usa para escrita — nenhum papel novo, nenhum
 * sistema de autenticação novo. Todo usuário autenticado VISUALIZA.
 */
export const AVAILABILITY_NOTE_WRITE_ROLES: string[] = ["ADMIN", "GESTOR"];

/** Limites de tamanho — validados no servidor, espelhados na UI. */
export const AVAILABILITY_NOTE_LIMITS = {
  cause: 200,
  reason: 2000,
  actionPlan: 2000,
  responsible: 120,
  /** OS vinculadas a uma mesma justificativa. */
  serviceOrders: 20
} as const;

/**
 * Uma ORDEM DE SERVIÇO vinculada à justificativa, já com os dados atuais da OS.
 * Os dados (título, grupo, status) são lidos da ServiceOrder a cada consulta —
 * nada é copiado para o vínculo.
 */
export type LinkedServiceOrderDTO = {
  linkId: string;
  osNumber: string;
  /** Operação de referência na tabela ServiceOrder; `null` se o registro saiu da base. */
  serviceOrderId: string | null;
  /** `false` quando a OS não está mais na base atual (vínculo mantido, aviso na tela). */
  found: boolean;
  title: string | null;
  /** Grupo de planejamento normalizado ("Mecânica", "Elétrica"…). */
  planningGroupLabel: string | null;
  /** "Fechada" só com todas as operações encerradas; senão o status pendente. */
  statusLabel: string | null;
  closed: boolean;
  equipmentLabel: string | null;
  /** ISO (data-base de início). */
  openedAt: string | null;
  linkedByName: string | null;
  /** ISO. */
  linkedAt: string;
};

/** Uma OS sugerida pela busca do autocomplete. */
export type ServiceOrderSearchItem = {
  osNumber: string;
  serviceOrderId: string;
  title: string;
  planningGroupLabel: string;
  statusLabel: string;
  closed: boolean;
  equipmentLabel: string;
  /** ISO (data-base de início). */
  openedAt: string | null;
  /** Equipamento da OS corresponde à máquina do PC-Factory. */
  sameMachine: boolean;
  /** Data-base dentro do período da justificativa. */
  inPeriod: boolean;
};

export type ServiceOrderSearchResult = {
  items: ServiceOrderSearchItem[];
  /** "machine" = só OS da máquina; "all" = todas as OS (priorizando máquina e período). */
  scope: "machine" | "all";
  /** TAGs SAP reconhecidas para a máquina; vazio = sem correspondência automática. */
  machineTags: string[];
};

/** Uma justificativa, já serializada (datas em string) para cruzar server→client. */
export type PcFactoryAvailabilityNoteDTO = {
  id: string;
  /** Chave canônica da máquina (igual a `PcFactoryReliabilityRow.machineName`). */
  resourceName: string;
  resourceCode: string | null;
  /** Janela analisada, "YYYY-MM-DD". Junto com resourceName forma a chave. */
  periodStart: string;
  periodEnd: string;
  /** Rótulo pronto do período ("01/08/2026 a 31/08/2026"). */
  periodLabel: string;
  /** MOTIVO: causa/resumo do problema. Opcional (justificativas antigas não têm). */
  cause: string | null;
  /** JUSTIFICATIVA: explicação gerencial do ocorrido. */
  reason: string;
  actionPlan: string | null;
  responsible: string | null;
  /** OS que registram a intervenção NESTE período (nunca de outra janela). */
  serviceOrders: LinkedServiceOrderDTO[];
  /** Foto dos números quando a justificativa foi escrita. Informativo, nunca fonte. */
  availabilitySnapshot: number | null;
  downtimeHoursSnapshot: number | null;
  createdById: string | null;
  createdByName: string | null;
  /** ISO. */
  createdAt: string;
  updatedById: string | null;
  updatedByName: string | null;
  /** ISO. */
  updatedAt: string;
};

/** Corpo aceito por POST /api/pc-factory/availability-notes. */
export type PcFactoryAvailabilityNoteInput = {
  resourceName: string;
  resourceCode?: string | null;
  periodStart: string;
  periodEnd: string;
  cause?: string | null;
  reason: string;
  actionPlan?: string | null;
  responsible?: string | null;
  /**
   * Lista COMPLETA de OS desejada para a justificativa (números da OS). Ausente =
   * não mexe nos vínculos; presente = o servidor sincroniza (inclui as novas,
   * remove as que saíram). Toda OS precisa existir na base.
   */
  serviceOrderNumbers?: string[];
  availabilitySnapshot?: number | null;
  downtimeHoursSnapshot?: number | null;
};

/** Erro de validação de entrada — vira 400 na rota, sem vazar detalhe interno. */
export class AvailabilityNoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvailabilityNoteValidationError";
  }
}

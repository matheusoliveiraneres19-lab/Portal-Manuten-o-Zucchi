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
  reason: 2000,
  actionPlan: 2000,
  responsible: 120
} as const;

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
  reason: string;
  actionPlan: string | null;
  responsible: string | null;
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
  reason: string;
  actionPlan?: string | null;
  responsible?: string | null;
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

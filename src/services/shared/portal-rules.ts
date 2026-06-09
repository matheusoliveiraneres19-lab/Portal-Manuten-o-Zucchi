/**
 * FONTE ÚNICA DA VERDADE — regras de negócio compartilhadas do portal.
 *
 * Toda regra que define "o que conta como X" (OS aberta, compra pendente,
 * alerta crítico, equipamento crítico) vive AQUI e é importada pelos services.
 * Nunca redefina esses conjuntos inline em um service ou componente — isso
 * reintroduz o problema de cada página calcular o seu próprio número.
 *
 * Se a regra mudar, muda só neste arquivo e todo o portal acompanha.
 */
import {
  Criticality,
  MaintenanceType,
  Priority,
  PurchaseStatus,
  ServiceOrderStatus
} from "@prisma/client";

/**
 * Ordens de Serviço consideradas "abertas" (em aberto / em andamento).
 * Regra única usada pelo dashboard, Ordens de Serviço e Equipamentos Críticos.
 */
export const OPEN_SERVICE_ORDER_STATUSES: ServiceOrderStatus[] = [
  ServiceOrderStatus.ABERTA,
  ServiceOrderStatus.LIBERADA,
  ServiceOrderStatus.EM_ANDAMENTO,
  ServiceOrderStatus.AGUARDANDO_MATERIAL
];

/** Status que encerram uma OS (usado em gráficos abertas x fechadas). */
export const CLOSED_SERVICE_ORDER_STATUSES: ServiceOrderStatus[] = [ServiceOrderStatus.FECHADA];

/** Compras consideradas "pendentes" (ainda exigem ação). */
export const PENDING_PURCHASE_STATUSES: PurchaseStatus[] = [
  PurchaseStatus.SOLICITADA,
  PurchaseStatus.EM_COTACAO,
  PurchaseStatus.APROVADA,
  PurchaseStatus.ATRASADA
];

/** Prioridades/severidades consideradas críticas (alertas e prioridades de OS). */
export const CRITICAL_PRIORITIES: Priority[] = [Priority.ALTA, Priority.CRITICA];

/** Criticidades de equipamento consideradas críticas (cadastro de Equipment). */
export const CRITICAL_EQUIPMENT_CRITICALITIES: Criticality[] = [Criticality.ALTA, Criticality.CRITICA];

/** Tipos de manutenção tratados como "quebra" para índice de quebra/recorrência. */
export const BREAKDOWN_MAINTENANCE_TYPES: MaintenanceType[] = [MaintenanceType.CORRETIVA];

/**
 * Limiares do score de criticidade calculado em critical-equipments.service.
 * score >= CRITICAL  -> "Crítico"
 * score >= ATTENTION -> "Atenção"
 * senão              -> "Monitorado"
 */
export const CRITICALITY_SCORE_THRESHOLD = 70;
export const ATTENTION_SCORE_THRESHOLD = 40;

/** Pesos do score de criticidade (ordens 60% / horas 30% / abertas 10%). */
export const CRITICALITY_WEIGHTS = {
  orders: 0.6,
  hours: 0.3,
  openOrders: 0.1
} as const;

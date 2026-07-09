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
 * score >= MONITOR   -> "Monitorado"
 * senão              -> "Normal"
 */
export const CRITICALITY_SCORE_THRESHOLD = 80;
export const ATTENTION_SCORE_THRESHOLD = 60;
export const MONITOR_SCORE_THRESHOLD = 40;

/**
 * Pesos do score de criticidade gerencial (0–100), somando 1,0:
 *  - 35% volume de ordens corretivas;
 *  - 25% horas apontadas;
 *  - 20% ordens em aberto;
 *  - 10% reincidência (repetição de OS no mesmo equipamento);
 *  - 10% tendência de piora (aumento de OS nos últimos meses).
 */
export const CRITICALITY_WEIGHTS = {
  orders: 0.35,
  hours: 0.25,
  openOrders: 0.2,
  recurrence: 0.1,
  worseningTrend: 0.1
} as const;

/**
 * Nº mínimo de OS no período para um equipamento ser considerado REINCIDENTE
 * (repetição relevante de intervenções corretivas no mesmo ativo raiz).
 */
export const RECURRENCE_MIN_ORDERS = 3;

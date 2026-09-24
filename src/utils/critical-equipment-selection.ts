/**
 * Seleção da análise de Equipamentos Críticos na URL — leitura e escrita num só
 * lugar, usada pela página (server), pelas rotas de API e pelo cliente.
 *
 *   ?family=Multifio&month=2026-08&machine=ZC-SR-G07-MF-0004&partition=<TAG>
 *
 * `rep` é aceito como alias legado de `partition` (links gerados antes da unificação).
 */
import type { CriticalEquipmentFilters, CriticalEquipmentSelection } from "@/types/critical-equipments";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";
import {
  PLANNING_ACTIVITY_ORDER,
  PLANNING_GROUP_ORDER,
  parseOrderClassFilter,
  type PlanningActivityTypeKey,
  type PlanningGroupKey
} from "@/utils/service-order-planning";

export const SELECTION_PARAM_KEYS = ["family", "month", "machine", "partition", "rep"] as const;

export const EMPTY_SELECTION: CriticalEquipmentSelection = { family: null, month: null, machine: null, partition: null };

type ParamReader = { get(key: string): string | null };

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseCriticalEquipmentSelection(params: ParamReader): CriticalEquipmentSelection {
  const month = clean(params.get("month"));
  return {
    family: clean(params.get("family")),
    month: month && /^\d{4}-\d{2}$/.test(month) ? month : null,
    machine: clean(params.get("machine")),
    partition: clean(params.get("partition")) ?? clean(params.get("rep"))
  };
}

/** Grava a seleção em `params` (removendo a anterior). */
export function writeSelectionParams(params: URLSearchParams, selection: CriticalEquipmentSelection): URLSearchParams {
  for (const key of SELECTION_PARAM_KEYS) params.delete(key);
  if (selection.family) params.set("family", selection.family);
  if (selection.month) params.set("month", selection.month);
  if (selection.machine) params.set("machine", selection.machine);
  if (selection.partition) params.set("partition", selection.partition);
  return params;
}

/** Filtros gerais da aba a partir da query string (mesmo contrato das rotas de API). */
export function parseCriticalEquipmentFilterParams(params: URLSearchParams): Partial<CriticalEquipmentFilters> {
  return {
    startDate: params.get("startDate") ?? undefined,
    endDate: params.get("endDate") ?? undefined,
    statuses: params.getAll("status") as ServiceOrderStatusLabel[],
    responsibleNames: params.getAll("responsavel"),
    planningGroups: params.getAll("grupo"),
    planningGroupKeys: params
      .getAll("grupoPlan")
      .filter((value): value is PlanningGroupKey => (PLANNING_GROUP_ORDER as string[]).includes(value)),
    activityTypes: params
      .getAll("atividade")
      .filter((value): value is PlanningActivityTypeKey => (PLANNING_ACTIVITY_ORDER as string[]).includes(value)),
    orderClass: parseOrderClassFilter(params.get("classe")),
    areas: params.getAll("area"),
    families: params.getAll("familia"),
    costCenters: params.getAll("cc"),
    sectors: params.getAll("setor"),
    onlyOpenOrders: params.get("abertas") === "1",
    onlyWithWorkedHours: params.get("horas") === "1",
    onlyRecurrent: params.get("reincidentes") === "1",
    onlyCritical: params.get("criticos") === "1",
    limit: Number(params.get("top")) || undefined
  };
}

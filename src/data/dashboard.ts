import {
  AlertTriangle,
  ClipboardList,
  Droplet,
  FileText,
  Package,
  ShoppingCart
} from "lucide-react";
import type { AlertItem, ChartPoint, PendingPurchase, RankingItem } from "@/types/dashboard";

/**
 * Fallback exibido SOMENTE quando o banco falha (catch em getDashboardData).
 *
 * Política de dados (TAREFA 7 — nunca exibir número fabricado):
 * - KPIs caem para "0" e são marcados como vazios (o card mostra o aviso
 *   "Aguardando importação" em vez de um valor que pareça real).
 * - Gráficos/tabelas ficam VAZIOS — cada card renderiza seu próprio empty state
 *   ("Sem registros no período"). Não há mais séries com números inventados.
 *
 * O cenário normal (banco vazio, sem erro) já passa pelo caminho de banco e
 * também resulta em estados vazios — este arquivo é só a rede de segurança.
 */
export const kpis = [
  { title: "OS Abertas", value: "0", tone: "blue", icon: ClipboardList },
  { title: "Compras Pendentes", value: "0", tone: "gold", icon: ShoppingCart },
  { title: "Máquinas Críticas", value: "0", tone: "red", icon: AlertTriangle },
  { title: "Consumo Lubrificantes", value: "0 L", tone: "blue", icon: Droplet },
  { title: "Materiais Mais Utilizados", value: "0", tone: "gold", icon: Package },
  { title: "Procedimentos Ativos", value: "0", tone: "blue", icon: FileText }
] as const;

export const openClosedOrders: ChartPoint[] = [];
export const correctivePreventive: ChartPoint[] = [];
export const criticalEquipment: RankingItem[] = [];
export const pendingPurchases: PendingPurchase[] = [];
export const alerts: AlertItem[] = [];
export const collaboratorHours: ChartPoint[] = [];
export const monthlyPurchases: ChartPoint[] = [];
export const lubricantConsumption: ChartPoint[] = [];
export const topBreakdownMachines: RankingItem[] = [];

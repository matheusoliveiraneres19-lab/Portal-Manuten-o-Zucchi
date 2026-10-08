/** Dados serializados que a página (server) entrega aos componentes MRP (client). */
import type { MrpAreasSummary } from "@/lib/mrp/areas";
import type { MrpBuyFilters } from "@/lib/mrp/buy-list";
import type { MrpTransitFilters } from "@/lib/mrp/transit";
import type { MrpIdleFilters } from "@/lib/mrp/idle";
import type { MrpBuyListing } from "@/services/mrp-listing.service";

/** Abas do módulo (`?tab=`). Só as `ready` são funcionais. */
export const MRP_TABS = [
  { key: "buy", label: "Comprar", ready: true },
  { key: "areas", label: "Áreas & Conjuntos", ready: true },
  { key: "transit", label: "Em trânsito", ready: true },
  { key: "idle", label: "Estoque parado", ready: true },
  { key: "base", label: "Base MRP", ready: false }
] as const;

export type MrpTab = "buy" | "areas" | "transit" | "idle";

export function parseMrpTab(value: string | null | undefined): MrpTab {
  return value === "areas" || value === "transit" || value === "idle" ? value : "buy";
}

/** KPIs da aba Em trânsito (do run): 4 de compras + "Saíram do MRP". */
export type MrpTransitKpisView = {
  linhas: number;
  pendentes: number;
  qtdPendente: number;
  recebidos: number;
  removedFromMrp: number;
  avoidedQty: number;
};

/** KPIs da aba Estoque parado (do run): total, semMov, parado e qtdParada de contar(). */
export type MrpIdleKpisView = { total: number; semMov: number; parado: number; qtdParada: number };

export type MrpKpisView = {
  total: number;
  Comprar: number;
  Verificar: number;
  Comprado: number;
  OK: number;
  qtd: number;
  transit: MrpTransitKpisView;
  idle: MrpIdleKpisView;
};

export type MrpSummaryView = {
  runId: string;
  createdAt: string;
  createdBy: string | null;
  depositFilter: string;
  kpis: MrpKpisView;
  base: { fileName: string; source: string; materialCount: number };
  stock: { fileName: string; depositInfo: string };
  purchases: { fileName: string };
};

export type MrpPageProps = {
  summary: MrpSummaryView | null;
  listing: MrpBuyListing | null;
  /** Cartões da aba Áreas & Conjuntos (null sem análise). */
  areas: MrpAreasSummary | null;
  filters: MrpBuyFilters;
  transitFilters: MrpTransitFilters;
  idleFilters: MrpIdleFilters;
  initialTab: MrpTab;
  canImport: boolean;
  hasActiveBase: boolean;
  defaultDeposit: string;
};

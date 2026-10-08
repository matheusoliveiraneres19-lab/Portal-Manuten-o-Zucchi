/** Dados serializados que a página (server) entrega aos componentes MRP (client). */
import type { MrpBuyFilters } from "@/lib/mrp/buy-list";
import type { MrpBuyListing } from "@/services/mrp-listing.service";

export type MrpKpisView = {
  total: number;
  Comprar: number;
  Verificar: number;
  Comprado: number;
  OK: number;
  qtd: number;
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
  filters: MrpBuyFilters;
  canImport: boolean;
  hasActiveBase: boolean;
  defaultDeposit: string;
};

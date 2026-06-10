"use client";

import { X } from "lucide-react";
import { PURCHASE_TYPE_LABELS, ITEM_NATURE_LABELS } from "@/utils/purchases-normalizer";
import type { ItemNature, PurchaseType } from "@/types/purchases";
import type { AppliedPurchaseFilters } from "@/components/purchases/filters";

const STATUS_LABELS: Record<string, string> = {
  "sem-pedido": "Sem pedido",
  "pendente-migo": "Pendente MIGO",
  "pendente-miro": "Pendente MIRO",
  atrasado: "Atrasado",
  "recebido-atraso": "Recebido c/ atraso"
};

type Chip = { key: keyof AppliedPurchaseFilters; label: string };

/** Chips dos filtros ativos, com remoção individual. */
export function PurchaseActiveChips({
  filters,
  onRemove
}: {
  filters: AppliedPurchaseFilters;
  onRemove: (key: keyof AppliedPurchaseFilters) => void;
}) {
  const chips: Chip[] = [];

  if (filters.startDate || filters.endDate) {
    chips.push({ key: "startDate", label: `Período: ${filters.startDate || "…"} → ${filters.endDate || "…"}` });
  }
  if (filters.supplier) chips.push({ key: "supplier", label: `Fornecedor: ${filters.supplier}` });
  if (filters.category) chips.push({ key: "category", label: `Categoria: ${filters.category}` });
  if (filters.purchaseType) {
    chips.push({ key: "purchaseType", label: PURCHASE_TYPE_LABELS[filters.purchaseType as PurchaseType] });
  }
  if (filters.nature) chips.push({ key: "nature", label: `Natureza: ${ITEM_NATURE_LABELS[filters.nature as ItemNature]}` });
  if (filters.requester) chips.push({ key: "requester", label: `Requisitante: ${filters.requester}` });
  if (filters.pendingStatus) chips.push({ key: "pendingStatus", label: STATUS_LABELS[filters.pendingStatus] ?? filters.pendingStatus });
  if (filters.requisition) chips.push({ key: "requisition", label: `Requisição: ${filters.requisition}` });
  if (filters.purchaseOrder) chips.push({ key: "purchaseOrder", label: `Pedido: ${filters.purchaseOrder}` });
  if (filters.material) chips.push({ key: "material", label: `Material: ${filters.material}` });
  if (filters.search) chips.push({ key: "search", label: `Busca: ${filters.search}` });

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Filtros ativos:</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
          className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-medium text-champagne transition hover:border-gold/60 hover:bg-gold/20"
        >
          {chip.label}
          <X className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}

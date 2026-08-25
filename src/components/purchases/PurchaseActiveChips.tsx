"use client";

import { X } from "lucide-react";
import {
  PURCHASE_KIND_FILTER_LABELS,
  PURCHASE_OPERATIONAL_STATUS_LABELS
} from "@/utils/purchase-classification";
import type { PurchaseOperationalStatus } from "@/types/purchases";
import {
  CLASSIFICATION_FILTER_KEYS,
  countActiveFilters,
  type AppliedPurchaseFilters
} from "@/components/purchases/filters";

type Chip = { key: keyof AppliedPurchaseFilters; value?: string; label: string };

type PurchaseActiveChipsProps = {
  filters: AppliedPurchaseFilters;
  /** Remove um valor específico de um grupo (value) ou o filtro inteiro (sem value). */
  onRemove: (key: keyof AppliedPurchaseFilters, value?: string) => void;
};

export function PurchaseActiveChips({ filters, onRemove }: PurchaseActiveChipsProps) {
  const chips: Chip[] = [];

  filters.suppliers.forEach((value) => chips.push({ key: "suppliers", value, label: `Fornecedor: ${value}` }));
  filters.categories.forEach((value) => chips.push({ key: "categories", value, label: `Categoria: ${value}` }));
  filters.purchasingGroups.forEach((value) => chips.push({ key: "purchasingGroups", value, label: `Grupo: ${value}` }));
  filters.kinds.forEach((value) =>
    chips.push({ key: "kinds", value, label: `Tipo: ${PURCHASE_KIND_FILTER_LABELS[value] ?? value}` })
  );
  filters.statuses.forEach((value) =>
    chips.push({ key: "statuses", value, label: `Status: ${PURCHASE_OPERATIONAL_STATUS_LABELS[value as PurchaseOperationalStatus] ?? value}` })
  );
  filters.requesters.forEach((value) => chips.push({ key: "requesters", value, label: `Requisitante: ${value}` }));
  for (const { level, key } of CLASSIFICATION_FILTER_KEYS) {
    (filters[key] as string[]).forEach((value) => chips.push({ key, value, label: `${level}: ${value}` }));
  }

  // Recorte da última planilha (Compras Realizadas): entra como chip removível
  // para ficar visível no mesmo lugar dos outros filtros ativos.
  if (filters.latestImportOnly) {
    chips.push({ key: "latestImportOnly", label: "Retrato: última planilha" });
  }

  if (filters.startDate || filters.endDate) {
    chips.push({ key: "startDate", label: `Período: ${filters.startDate || "…"} → ${filters.endDate || "…"}` });
  }
  if (filters.search.trim()) {
    chips.push({ key: "search", label: `Busca: ${filters.search.trim()}` });
  }

  const total = countActiveFilters(filters);
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Filtros ativos: {total}</span>
      {chips.map((chip) => (
        <button
          key={`${chip.key}:${chip.value ?? "_"}`}
          type="button"
          onClick={() => onRemove(chip.key, chip.value)}
          className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-medium text-champagne transition hover:border-gold/60 hover:bg-gold/20"
        >
          {chip.label}
          <X className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}

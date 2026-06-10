"use client";

import { ShoppingCart, Upload } from "lucide-react";

type PurchaseEmptyStateProps = {
  title?: string;
  description?: string;
  onImport: () => void;
};

/** Estado vazio elegante exibido quando ainda não há compras importadas. */
export function PurchaseEmptyState({
  title = "Nenhuma compra importada ainda",
  description = "Importe a planilha BASE DE DADOS PORTAL COMPRAS.xlsx (aba \"Data\") para ver indicadores, gráficos e tabelas.",
  onImport
}: PurchaseEmptyStateProps) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-4 rounded-lg p-10 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-petroleum text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
        <ShoppingCart className="h-8 w-8" strokeWidth={1.6} />
      </div>
      <div>
        <h3 className="font-serif text-xl text-zinc-900">{title}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={onImport}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-[#5a3d12] transition hover:bg-gold/25"
      >
        <Upload className="h-4 w-4" /> Importar Excel
      </button>
    </div>
  );
}

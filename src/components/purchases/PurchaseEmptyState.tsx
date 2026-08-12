"use client";

import { RefreshCw, ServerCrash, ShoppingCart, Upload } from "lucide-react";

type PurchaseEmptyStateProps = {
  title?: string;
  description?: string;
  onImport: () => void;
  /**
   * true quando a consulta ao banco FALHOU (não quando simplesmente não há
   * compras). Muda a mensagem e a ação: pedir "importe a planilha" numa queda de
   * banco manda o usuário reimportar dados que já estão lá.
   */
  unavailable?: boolean;
};

/** Estado vazio da aba de Compras: sem dados importados OU dados indisponíveis. */
export function PurchaseEmptyState({
  title = "Nenhuma compra importada ainda",
  description = "Importe a planilha BASE DE DADOS PORTAL COMPRAS.xlsx (aba \"Data\") para ver indicadores, gráficos e tabelas.",
  onImport,
  unavailable = false
}: PurchaseEmptyStateProps) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-4 p-10 text-center">
      <div
        className={`grid h-16 w-16 place-items-center rounded-full text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${
          unavailable ? "bg-danger" : "bg-petroleum"
        }`}
      >
        {unavailable ? (
          <ServerCrash className="h-8 w-8" strokeWidth={1.6} />
        ) : (
          <ShoppingCart className="h-8 w-8" strokeWidth={1.6} />
        )}
      </div>
      <div>
        <h3 className="font-serif text-xl text-ink">
          {unavailable ? "Dados de compras indisponíveis" : title}
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutralized-strong">
          {unavailable
            ? "Não foi possível consultar o banco de dados agora. Os dados importados não foram perdidos — atualize a página em alguns instantes."
            : description}
        </p>
      </div>
      {unavailable ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-danger/45 bg-danger/10 px-5 text-sm font-bold text-danger-strong transition hover:bg-danger/20"
        >
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
      ) : (
        <button
          type="button"
          onClick={onImport}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-gold-deep transition hover:bg-gold/25"
        >
          <Upload className="h-4 w-4" /> Importar Excel
        </button>
      )}
    </div>
  );
}

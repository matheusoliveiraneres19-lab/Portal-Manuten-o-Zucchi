"use client";

import { Factory, RefreshCw, ServerCrash, Upload } from "lucide-react";

type PcFactoryEmptyStateProps = {
  onImport: () => void;
  /** true quando a consulta ao banco falhou (ver PageDataSource "unavailable"). */
  unavailable?: boolean;
};

export function PcFactoryEmptyState({ onImport, unavailable = false }: PcFactoryEmptyStateProps) {
  return (
    <div className="relative overflow-hidden rounded-card border border-gold/20 bg-ink p-10 text-center shadow-premium">
      <div className="login-marble-bg absolute inset-0 opacity-80" />
      <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center gap-4">
        <span
          className={`grid h-16 w-16 place-items-center rounded-full border ${
            unavailable ? "border-danger/45 bg-danger/15 text-danger-soft" : "border-gold/35 bg-gold/10 text-gold"
          }`}
        >
          {unavailable ? (
            <ServerCrash className="h-8 w-8" strokeWidth={1.6} />
          ) : (
            <Factory className="h-8 w-8" strokeWidth={1.6} />
          )}
        </span>
        <h2 className="font-serif text-2xl text-white">
          {unavailable ? "Dados do PC-Factory indisponíveis" : "Nenhum dado do PC-Factory importado ainda"}
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-zinc-300">
          {unavailable
            ? "Não foi possível consultar o banco de dados agora. Os dados importados não foram perdidos — atualize a página em alguns instantes."
            : "Importe um relatório do PC-Factory para visualizar disponibilidade, utilização, MTBF, MTTR e status das máquinas."}
        </p>
        {unavailable ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-1 inline-flex h-11 items-center gap-2 rounded-lg border border-danger/55 bg-danger/15 px-5 text-sm font-bold text-danger-soft transition hover:bg-danger/25"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        ) : (
          <button
            type="button"
            onClick={onImport}
            className="mt-1 inline-flex h-11 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-gold transition hover:bg-gold/25"
          >
            <Upload className="h-4 w-4" />
            Importar Excel
          </button>
        )}
      </div>
    </div>
  );
}

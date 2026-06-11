"use client";

import { Factory, Upload } from "lucide-react";

type PcFactoryEmptyStateProps = {
  onImport: () => void;
};

export function PcFactoryEmptyState({ onImport }: PcFactoryEmptyStateProps) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-10 text-center shadow-premium">
      <div className="login-marble-bg absolute inset-0 opacity-80" />
      <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-full border border-gold/35 bg-gold/10 text-gold">
          <Factory className="h-8 w-8" strokeWidth={1.6} />
        </span>
        <h2 className="font-serif text-2xl text-white">Nenhum dado do PC-Factory importado ainda</h2>
        <p className="max-w-md text-sm leading-relaxed text-zinc-300">
          Importe um relatório do PC-Factory para visualizar disponibilidade, utilização, MTBF, MTTR e status das
          máquinas.
        </p>
        <button
          type="button"
          onClick={onImport}
          className="mt-1 inline-flex h-11 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-gold transition hover:bg-gold/25"
        >
          <Upload className="h-4 w-4" />
          Importar Excel
        </button>
      </div>
    </div>
  );
}

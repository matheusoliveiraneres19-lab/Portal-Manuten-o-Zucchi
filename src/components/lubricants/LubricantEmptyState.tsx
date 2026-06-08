"use client";

import { Droplets, Upload } from "lucide-react";

type LubricantEmptyStateProps = {
  onImport: () => void;
};

export function LubricantEmptyState({ onImport }: LubricantEmptyStateProps) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-10 text-center shadow-premium">
      <div className="login-marble-bg absolute inset-0 opacity-80" />
      <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-full border border-gold/35 bg-gold/10 text-gold">
          <Droplets className="h-8 w-8" strokeWidth={1.6} />
        </span>
        <h2 className="font-serif text-2xl text-white">Nenhuma movimentação de lubrificante ainda</h2>
        <p className="max-w-md text-sm leading-relaxed text-zinc-300">
          Importe a planilha <strong className="text-champagne">BASE DE DADOS LUBRIFICAÇÃO.xlsx</strong> (extraída do
          SAP/Fiori) para visualizar entradas, saídas, saldo e consumo por material.
        </p>
        <button
          type="button"
          onClick={onImport}
          className="mt-1 inline-flex h-11 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-gold transition hover:bg-gold/25"
        >
          <Upload className="h-4 w-4" />
          Importar planilha Excel
        </button>
      </div>
    </div>
  );
}

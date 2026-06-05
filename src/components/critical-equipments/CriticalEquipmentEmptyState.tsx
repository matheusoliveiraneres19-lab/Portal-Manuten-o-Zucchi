import { PackageSearch } from "lucide-react";

export function CriticalEquipmentEmptyState() {
  return (
    <div className="rounded-lg border border-gold/20 bg-[#070808] p-10 text-center shadow-premium">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-gold/30 bg-black/40 text-gold">
        <PackageSearch className="h-7 w-7" strokeWidth={1.6} />
      </span>
      <h2 className="mt-4 font-serif text-2xl text-white">
        Não há ordens suficientes para calcular equipamentos críticos neste período.
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
        Importe ordens de manutenção ou ajuste o período para visualizar a análise.
      </p>
    </div>
  );
}

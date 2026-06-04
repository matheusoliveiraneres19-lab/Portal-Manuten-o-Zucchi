import { Construction, Gem } from "lucide-react";

type ModulePlaceholderProps = {
  title: string;
  description: string;
};

export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <section className="relative min-h-[calc(100vh-112px)] overflow-hidden rounded-lg border border-gold/20 bg-[#060707] shadow-premium">
      <div className="login-marble-bg absolute inset-0 opacity-90" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.72),rgba(0,0,0,0.42)),radial-gradient(circle_at_84%_12%,rgba(196,154,69,0.16),transparent_24rem)]" />

      <div className="relative z-10 flex min-h-[calc(100vh-112px)] items-center px-5 py-10 sm:px-8 lg:px-10">
        <div className="w-full max-w-3xl">
          <div className="mb-5 flex items-center gap-3 text-gold">
            <Gem className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.28em] text-champagne/80">
              Portal de Gestão da Manutenção
            </span>
          </div>

          <h1 className="font-serif text-4xl leading-tight text-white sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-200">{description}</p>

          <div className="mt-8 rounded-lg border border-gold/25 bg-black/48 p-6 shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-gold/35 bg-gold/10 text-gold">
                <Construction className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-champagne">Módulo em desenvolvimento</h2>
                <p className="mt-1 text-sm leading-relaxed text-zinc-300">
                  Esta área está preparada para receber as próximas funcionalidades do portal sem
                  interromper a navegação atual.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

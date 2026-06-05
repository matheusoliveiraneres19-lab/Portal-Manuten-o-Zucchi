import { Award, Crown, Gem, ShieldCheck } from "lucide-react";

const values = [
  { label: "Tradição", icon: Crown },
  { label: "Excelência", icon: Award },
  { label: "Precisão", icon: Gem },
  { label: "Confiança", icon: ShieldCheck }
];

export function HeroBanner() {
  return (
    <section className="relative min-h-[300px] overflow-hidden border border-black/10 bg-[url('/images/login-background.webp')] bg-cover bg-center bg-no-repeat shadow-premium lg:min-h-[340px]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.76)_0%,rgba(0,0,0,0.68)_38%,rgba(0,0,0,0.38)_68%,rgba(0,0,0,0.16)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(196,154,69,0.16),transparent_24rem),linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.42))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/62 to-transparent" />

      <div className="relative z-10 max-w-3xl px-6 py-9 sm:px-9 lg:py-12">
        <h2 className="font-serif text-3xl leading-tight text-white drop-shadow sm:text-5xl">
          Bem-vindo ao Portal de Gestão da Manutenção{" "}
          <span className="text-gold">Zucchi</span>
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-100/90">
          Centralize indicadores, ordens de serviço, compras, materiais, lubrificantes e alertas de
          equipamentos em um só lugar. Mais controle, eficiência e performance para a manutenção da
          Zucchi Stones Luxury.
        </p>

        <div className="mt-7 flex max-w-xl items-center gap-4">
          <span className="h-px flex-1 bg-gradient-to-r from-gold to-transparent" />
          <Gem className="h-5 w-5 text-gold" />
          <span className="h-px flex-1 bg-gradient-to-l from-gold to-transparent" />
        </div>

        <div className="mt-5 flex flex-wrap gap-5">
          {values.map((value) => {
            const Icon = value.icon;
            return (
              <div key={value.label} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gold">
                <Icon className="h-4 w-4" />
                {value.label}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


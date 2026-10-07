import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  Gauge,
  Layers,
  PackageSearch,
  Repeat,
  ShieldAlert,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  type LucideIcon
} from "lucide-react";

/**
 * ANÁLISE MRP — estrutura inicial (etapa 1).
 *
 * Substitui a antiga tela de Lubrificantes. Nesta etapa NÃO há cálculo nem
 * consulta: os indicadores abaixo são apenas espaços reservados, sem valores.
 * As regras de MRP e a fonte oficial de materiais/estoque SAP serão definidas
 * posteriormente — os dados de Lubrificação (Lubricant, LubricantMovement…)
 * NÃO devem ser reaproveitados aqui como MRP genérico.
 */

type PlannedIndicator = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const PLANNED_INDICATORS: PlannedIndicator[] = [
  { title: "Estoque Atual", description: "Saldo disponível por material.", icon: Layers },
  { title: "Estoque Mínimo", description: "Nível de segurança parametrizado.", icon: TrendingDown },
  { title: "Estoque Máximo", description: "Limite superior de armazenagem.", icon: TrendingUp },
  { title: "Ponto de Reposição", description: "Gatilho para nova necessidade.", icon: Repeat },
  { title: "Consumo Médio", description: "Média de saídas no período.", icon: Gauge },
  { title: "Necessidade de Compra", description: "Quantidade sugerida para reposição.", icon: ShoppingBag },
  { title: "Entradas", description: "Recebimentos de materiais.", icon: ArrowDownToLine },
  { title: "Saídas", description: "Requisições e consumos.", icon: ArrowUpFromLine },
  { title: "Materiais Críticos", description: "Itens com risco de ruptura.", icon: ShieldAlert },
  { title: "Cobertura de Estoque", description: "Dias de consumo cobertos pelo saldo.", icon: CalendarClock }
];

const SCOPE_ITEMS = [
  "estoque;",
  "entradas;",
  "saídas;",
  "necessidades de reposição;",
  "consumo de materiais;",
  "parâmetros MRP."
];

export function MrpAnalysisPage() {
  return (
    <section className="space-y-4 text-champagne">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-ink p-5 shadow-premium sm:p-6">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.15),transparent_22rem)]" />
        <div className="relative z-10">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-gold">
            <PackageSearch className="h-5 w-5" />
            <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-champagne/80">
              Gestão de Materiais
            </span>
          </div>
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Análise MRP</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Analise necessidades de materiais, movimentações de estoque e parâmetros de reposição para apoiar o
            planejamento da manutenção.
          </p>
        </div>
      </header>

      {/* Escopo + estado vazio */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="rounded-lg border border-gold/20 bg-ink/80 p-5 shadow-premium xl:col-span-5">
          <h2 className="font-serif text-xl text-white">Planejamento e análise de materiais</h2>
          <p className="mt-2 text-sm leading-relaxed text-parchment">Este módulo será utilizado para análise de:</p>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-300">
            {SCOPE_ITEMS.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-gold/20 bg-ink p-8 text-center shadow-premium xl:col-span-7">
          <div className="login-marble-bg absolute inset-0 opacity-80" />
          <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-full border border-gold/35 bg-gold/10 text-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
              <PackageSearch className="h-8 w-8" strokeWidth={1.6} />
            </span>
            <div>
              <h2 className="font-serif text-2xl text-white">Módulo MRP em configuração</h2>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-parchment">
                As análises e indicadores serão adicionados na próxima etapa.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Indicadores previstos — sem valores até a definição das regras MRP */}
      <section className="rounded-lg border border-gold/20 bg-ink/80 p-5 shadow-premium">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-white">Indicadores previstos</h2>
          <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Aguardando definição das regras</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {PLANNED_INDICATORS.map(({ title, description, icon: Icon }) => (
            <div
              key={title}
              className="flex flex-col gap-2 rounded-lg border border-dashed border-gold/25 bg-black/30 p-4"
            >
              <div className="flex items-center gap-2 text-gold">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-champagne">{title}</span>
              </div>
              <span className="font-serif text-2xl text-zinc-600">—</span>
              <p className="text-[11px] leading-snug text-zinc-500">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

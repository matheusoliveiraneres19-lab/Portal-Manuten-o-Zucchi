import { Activity, AlertTriangle, Boxes, ClipboardList, Clock, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CriticalEquipmentSummary } from "@/types/critical-equipments";

type CriticalEquipmentKpiCardsProps = {
  summary: CriticalEquipmentSummary;
};

type Tone = "blue" | "gold" | "red";

const toneClass: Record<Tone, string> = {
  blue: "bg-petroleum text-white",
  gold: "bg-gold text-white",
  red: "bg-danger text-white"
};

export function CriticalEquipmentKpiCards({ summary }: CriticalEquipmentKpiCardsProps) {
  const hasData = summary.totalOrdersInPeriod > 0;

  const cards: Array<{ title: string; value: string; description: string; icon: LucideIcon; tone: Tone }> = [
    {
      title: "Equipamentos analisados",
      value: formatInt(summary.totalEquipmentsAnalyzed),
      description: "Ativos com ordens no período",
      icon: Boxes,
      tone: "blue"
    },
    {
      title: "Total de ordens no período",
      value: formatInt(summary.totalOrdersInPeriod),
      description: "Ordens de manutenção consideradas",
      icon: ClipboardList,
      tone: "gold"
    },
    {
      title: "Equipamento com mais ordens",
      value: hasData ? summary.equipmentWithMostOrders : "—",
      description: hasData ? `${formatInt(summary.highestOrderCount)} ordens` : "Sem registros no período",
      icon: TrendingUp,
      tone: "blue"
    },
    {
      title: "Horas apontadas no período",
      value: formatHours(summary.totalWorkedHours),
      description: "Esforço total de manutenção",
      icon: Clock,
      tone: "gold"
    },
    {
      title: "Média de OS por equipamento",
      value: formatDecimal(summary.averageOrdersPerEquipment),
      description: "Recorrência média por ativo",
      icon: Activity,
      tone: "blue"
    },
    {
      title: "Equipamentos críticos",
      value: formatInt(summary.totalCriticalEquipments),
      description: "Score crítico ≥ 70",
      icon: AlertTriangle,
      tone: "red"
    }
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isEmpty = !hasData;

        return (
          <article
            key={card.title}
            className="panel flex min-h-[112px] items-center gap-4 rounded-lg p-4 transition hover:-translate-y-0.5 hover:shadow-premium"
          >
            <div
              className={`grid h-14 w-14 shrink-0 place-items-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${toneClass[card.tone]}`}
            >
              <Icon className="h-7 w-7" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-800">{card.title}</h3>
              <div className="mt-0.5 truncate text-2xl font-light tracking-normal text-zinc-950" title={card.value}>
                {card.value}
              </div>
              <p className={`mt-0.5 text-[11px] ${isEmpty ? "text-zinc-400" : "text-zinc-500"}`}>
                {card.description}
              </p>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function formatInt(value: number): string {
  return value.toLocaleString("pt-BR");
}

function formatDecimal(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatHours(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} H`;
}

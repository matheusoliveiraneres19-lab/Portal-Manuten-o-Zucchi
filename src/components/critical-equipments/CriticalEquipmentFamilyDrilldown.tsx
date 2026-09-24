"use client";

import { AlertTriangle, ArrowLeft, ChevronRight, Info, Loader2, X } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ALL_ORDERS_KEY, NO_COMPONENT_KEY, formatMonthLong } from "@/services/critical-equipment-evolution.service";
import type {
  FamilyDrilldownComponent,
  FamilyDrilldownMachine,
  FamilyDrilldownMachineDetail,
  FamilyDrilldownOrders,
  FamilyDrilldownResponse,
  FamilyDrilldownSelection,
  FamilyDrilldownSplit
} from "@/types/critical-equipments";
import type { ServiceOrderStatusLabel } from "@/types/service-orders";

type Props = {
  selection: FamilyDrilldownSelection;
  data: FamilyDrilldownResponse | null;
  loading: boolean;
  error: string | null;
  accentColor: string;
  onChange: (next: FamilyDrilldownSelection) => void;
  onClose: () => void;
};

const STATUS_LABELS: Record<ServiceOrderStatusLabel, string> = {
  ABERTA: "Aberta",
  LIBERADA: "Liberada",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_MATERIAL: "Aguardando material",
  FECHADA: "Fechada",
  CANCELADA: "Cancelada"
};

/**
 * Painel FAMÍLIA → MÊS → MÁQUINA → REPARTIMENTO → OS abaixo do gráfico de evolução.
 * Barras em HTML (não SVG): cada linha é um botão, alcançável por Tab/Enter/Espaço.
 */
export function CriticalEquipmentFamilyDrilldown({ selection, data, loading, error, accentColor, onChange, onClose }: Props) {
  // Mostra o dado anterior enquanto o próximo nível carrega (sem "piscar" vazio).
  const current = data && data.selection.family === selection.family ? data : null;
  const periodLabel = selection.month ? formatMonthLong(selection.month) : "Período inteiro";
  const machineName = current?.machine?.name ?? current?.machines.find((m) => m.rootTag === selection.machine)?.name;
  const componentLabel =
    selection.component === ALL_ORDERS_KEY
      ? "Todas as OS"
      : current?.machine?.components.find((component) => component.key === selection.component)?.label;

  const base = { family: selection.family, month: selection.month };

  return (
    <section
      className="panel rounded-lg p-4"
      aria-label={`Detalhamento de ${selection.family}`}
      aria-busy={loading}
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
            Detalhamento — {selection.family} — {periodLabel}
          </h3>
          <Breadcrumb
            items={[
              {
                label: `Família: ${selection.family}`,
                onClick:
                  selection.month || selection.machine
                    ? () => onChange({ ...base, month: null, machine: null, component: null })
                    : undefined
              },
              {
                label: periodLabel,
                onClick: selection.machine ? () => onChange({ ...base, machine: null, component: null }) : undefined
              },
              ...(selection.machine
                ? [
                    {
                      label: machineName ?? selection.machine,
                      onClick: selection.component
                        ? () => onChange({ ...base, machine: selection.machine, component: null })
                        : undefined
                    }
                  ]
                : []),
              ...(selection.component ? [{ label: componentLabel ?? selection.component }] : [])
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-gold" aria-label="Carregando" /> : null}
          {selection.machine ? (
            <BackButton
              label={selection.component ? "Voltar para repartimentos" : "Voltar para máquinas"}
              onClick={() =>
                onChange(
                  selection.component
                    ? { ...base, machine: selection.machine, component: null }
                    : { ...base, machine: null, component: null }
                )
              }
            />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhamento e voltar para famílias"
            title="Voltar para famílias"
            className="rounded-md border border-zinc-200 p-1.5 text-zinc-500 transition hover:border-gold/60 hover:text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error ? (
        <p className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-danger">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      ) : !current ? (
        <p className="flex items-center gap-2 py-6 text-[12px] text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando detalhamento…
        </p>
      ) : (
        <div className={`space-y-4 transition ${loading ? "opacity-60" : ""}`}>
          <SplitSummary
            split={current.family}
            extra={[
              { label: "Máquinas afetadas", value: fmtInt(current.family.machineCount) },
              ...(selection.month
                ? [
                    {
                      label: "Variação vs mês anterior",
                      value:
                        current.variationVsPreviousMonth === null
                          ? "Sem base comparável"
                          : `${current.variationVsPreviousMonth > 0 ? "+" : ""}${fmtPercent(current.variationVsPreviousMonth)}`
                    }
                  ]
                : [])
            ]}
          />

          {current.family.totalOrders === 0 ? (
            <EmptyState
              title="Sem OS nesta família no mês"
              description="Não há ordens desta família no mês selecionado com os filtros atuais."
            />
          ) : !current.machine ? (
            <MachineRanking
              machines={current.machines}
              accentColor={accentColor}
              onSelect={(rootTag) => onChange({ ...base, machine: rootTag, component: null })}
            />
          ) : (
            <MachineDetail
              machine={current.machine}
              accentColor={accentColor}
              selectedComponent={current.selection.component}
              onSelect={(key) => onChange({ ...base, machine: current.machine!.rootTag, component: key })}
            />
          )}

          {current.orders ? <OrdersTable orders={current.orders} /> : null}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Níveis                                                             */
/* ------------------------------------------------------------------ */

function MachineRanking({
  machines,
  accentColor,
  onSelect
}: {
  machines: FamilyDrilldownMachine[];
  accentColor: string;
  onSelect: (rootTag: string) => void;
}) {
  const max = Math.max(1, ...machines.map((machine) => machine.totalOrders));
  return (
    <div>
      <LevelTitle title="Máquinas da família" hint="Ordenadas por nº de OS. Clique para ver os repartimentos." />
      <RankingHeader cols={["Máquina", "OS", "% da família"]} />
      <ul className="space-y-0.5">
        {machines.map((machine) => (
          <li key={machine.rootTag}>
            <RankingRow
              label={machine.name}
              sublabel={machine.rootTag}
              value={machine.totalOrders}
              percent={machine.percentOfFamily}
              max={max}
              color={accentColor}
              split={machine}
              ariaLabel={`${machine.name}: ${fmtInt(machine.totalOrders)} OS, ${fmtPercent(machine.percentOfFamily)} da família. Ver repartimentos.`}
              onClick={() => onSelect(machine.rootTag)}
            />
          </li>
        ))}
      </ul>
      <SumCheck label="Soma das máquinas" value={machines.reduce((sum, machine) => sum + machine.totalOrders, 0)} />
    </div>
  );
}

function MachineDetail({
  machine,
  accentColor,
  selectedComponent,
  onSelect
}: {
  machine: FamilyDrilldownMachineDetail;
  accentColor: string;
  selectedComponent: string | null;
  onSelect: (key: string) => void;
}) {
  const max = Math.max(1, ...machine.components.map((component) => component.totalOrders));
  const recurrence = machine.recurrenceWindow;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2">
        <p className="text-[13px] font-bold text-zinc-900">
          {machine.name} <span className="font-mono text-[11px] font-normal text-zinc-500">{machine.rootTag}</span>
        </p>
        <p className="text-[12px] text-zinc-700">
          <strong className="tabular-nums">{fmtInt(machine.split.totalOrders)}</strong> OS ·{" "}
          <span className="text-danger">{fmtInt(machine.split.correctiveOrders)} corretivas</span> ·{" "}
          <span className="text-emerald-700">{fmtInt(machine.split.plannedOrders)} planejadas</span>
          {machine.split.unclassifiedOrders > 0 ? ` · ${fmtInt(machine.split.unclassifiedOrders)} não classificadas` : ""} ·{" "}
          {fmtHours(machine.split.totalWorkedHours)} h apontadas
        </p>
      </div>

      {!machine.hasHierarchy ? (
        <p className="flex items-start gap-2 rounded-md border border-gold/30 bg-gold/5 px-3 py-2 text-[12px] text-zinc-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" />
          Não há subdivisões técnicas cadastradas para esta máquina. As OS estão listadas abaixo.
        </p>
      ) : (
        <>
          <p className="text-[12px] text-zinc-700">
            <strong className="tabular-nums">{fmtInt(machine.coverage.identified)}</strong> de{" "}
            <strong className="tabular-nums">{fmtInt(machine.split.totalOrders)}</strong> OS possuem repartimento
            identificado · Sem repartimento: <strong className="tabular-nums">{fmtInt(machine.coverage.unidentified)}</strong>{" "}
            · Cobertura da hierarquia: <strong className="tabular-nums">{fmtPercent(machine.coverage.percent)}</strong>
            <span className="text-zinc-500"> ({fmtInt(machine.registeredChildren)} subdivisões cadastradas)</span>
          </p>

          <div>
            <LevelTitle
              title={`${machine.name} — onde estão as OS`}
              hint="Agrupado pelo 1º nível abaixo da máquina no Local de Instalação. Clique para ver as OS."
            />
            <RankingHeader
              cols={["Repartimento", "OS", "% da máquina"]}
              extra={recurrence ? `Últimos ${recurrence.months.length} meses` : undefined}
            />
            <ul className="space-y-0.5">
              {machine.components.map((component) => (
                <li key={component.key}>
                  <RankingRow
                    label={component.label}
                    sublabel={componentSublabel(component, machine.rootTag)}
                    value={component.totalOrders}
                    percent={component.percentOfMachine}
                    max={max}
                    color={component.key === NO_COMPONENT_KEY ? "#A8A29E" : accentColor}
                    split={component}
                    active={selectedComponent === component.key}
                    extra={
                      component.recurrenceOrders !== null
                        ? `${fmtInt(component.recurrenceOrders)} OS · ${component.recurrenceActiveMonths}/${recurrence?.months.length} meses`
                        : undefined
                    }
                    ariaLabel={`${component.label}: ${fmtInt(component.totalOrders)} OS, ${fmtPercent(component.percentOfMachine)} da máquina. Ver OS.`}
                    onClick={() => onSelect(component.key)}
                  />
                </li>
              ))}
            </ul>
            <SumCheck
              label="Soma dos repartimentos"
              value={machine.components.reduce((sum, component) => sum + component.totalOrders, 0)}
            />
            {recurrence ? (
              <p className="mt-1 text-[10px] text-zinc-500">
                Recorrência: OS do repartimento em {recurrence.months.map((month) => month.label).join(", ")}
                {recurrence.limitedByPeriod ? " (janela limitada ao período filtrado)" : ""}.
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-zinc-500">
                Selecione um mês no gráfico para ver a recorrência (mês + 2 anteriores).
              </p>
            )}
          </div>

          {selectedComponent !== ALL_ORDERS_KEY ? (
            <button
              type="button"
              onClick={() => onSelect(ALL_ORDERS_KEY)}
              className="text-[11px] font-semibold text-gold-deep underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              Ver todas as OS da máquina
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function OrdersTable({ orders }: { orders: FamilyDrilldownOrders }) {
  return (
    <div>
      <LevelTitle
        title={`Ordens — ${orders.scopeLabel}`}
        hint={
          orders.truncated
            ? `Mostrando as ${fmtInt(orders.items.length)} mais recentes de ${fmtInt(orders.total)} OS. Selecione um mês para reduzir a lista.`
            : `${fmtInt(orders.total)} OS`
        }
      />
      {orders.items.length === 0 ? (
        <p className="text-[12px] text-zinc-500">Nenhuma OS neste recorte.</p>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-md border border-zinc-200">
          <table className="w-full min-w-[960px] text-[11px]">
            <thead className="sticky top-0 bg-zinc-50">
              <tr className="border-b border-zinc-200 text-left text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2 font-bold">OS</th>
                <th className="px-2 py-2 font-bold">Título</th>
                <th className="px-2 py-2 font-bold">Status</th>
                <th className="px-2 py-2 font-bold">Tipo</th>
                <th className="px-2 py-2 font-bold">Responsável</th>
                <th className="px-2 py-2 font-bold">Data-base</th>
                <th className="px-2 py-2 font-bold">Equipamento</th>
                <th className="px-2 py-2 font-bold">Local de Instalação</th>
                <th className="px-2 py-2 text-right font-bold">Horas</th>
              </tr>
            </thead>
            <tbody>
              {orders.items.map((order) => (
                <tr key={order.id} className="border-b border-zinc-100 align-top">
                  <td className="px-2 py-1.5 font-mono font-semibold text-zinc-800">{order.osNumber}</td>
                  <td className="max-w-[260px] px-2 py-1.5 text-zinc-800">
                    <span className="line-clamp-2" title={order.title}>
                      {order.title}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-zinc-700">{STATUS_LABELS[order.status] ?? order.status}</td>
                  <td className="px-2 py-1.5 text-zinc-700">{order.activityTypeLabel}</td>
                  <td className="px-2 py-1.5 text-zinc-700">{order.responsibleName || "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-zinc-700">{fmtDate(order.openedAt)}</td>
                  <td className="max-w-[180px] px-2 py-1.5 text-zinc-700">
                    <span className="line-clamp-2">{order.equipmentName || "—"}</span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-600">{order.equipmentCode || "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-zinc-800">
                    {order.workedHours !== null ? fmtHours(order.workedHours) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Peças                                                              */
/* ------------------------------------------------------------------ */

function SplitSummary({ split, extra }: { split: FamilyDrilldownSplit; extra: Array<{ label: string; value: string }> }) {
  const tiles = [
    { label: "OS no recorte", value: fmtInt(split.totalOrders) },
    { label: "Corretivas", value: fmtInt(split.correctiveOrders), className: "text-danger" },
    { label: "Planejadas", value: fmtInt(split.plannedOrders), className: "text-emerald-700" },
    ...(split.unclassifiedOrders > 0 ? [{ label: "Não classificadas", value: fmtInt(split.unclassifiedOrders) }] : []),
    { label: "Horas apontadas", value: `${fmtHours(split.totalWorkedHours)} h` },
    ...extra
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-md border border-zinc-200 px-2.5 py-1.5">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{tile.label}</dt>
          <dd className={`text-[15px] font-bold tabular-nums text-zinc-900 ${"className" in tile ? tile.className : ""}`}>
            {tile.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RankingHeader({ cols, extra }: { cols: [string, string, string]; extra?: string }) {
  return (
    <div className="flex items-center gap-3 px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
      <span className="min-w-0 flex-1">{cols[0]}</span>
      <span className="w-12 text-right">{cols[1]}</span>
      <span className="w-14 text-right">{cols[2]}</span>
      {extra ? <span className="hidden w-32 text-right md:block">{extra}</span> : null}
      <span className="w-4" />
    </div>
  );
}

function RankingRow({
  label,
  sublabel,
  value,
  percent,
  max,
  color,
  split,
  extra,
  active,
  ariaLabel,
  onClick
}: {
  label: string;
  sublabel?: string;
  value: number;
  percent: number;
  max: number;
  color: string;
  split: FamilyDrilldownSplit;
  extra?: string;
  active?: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition hover:bg-gold/[0.06] focus-visible:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
        active ? "bg-gold/10" : ""
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12px] font-semibold text-zinc-900" title={label}>
            {label}
          </span>
          <span className="hidden shrink-0 text-[10px] text-zinc-500 sm:inline">
            <span className="text-danger">{fmtInt(split.correctiveOrders)} corr.</span> ·{" "}
            <span className="text-emerald-700">{fmtInt(split.plannedOrders)} plan.</span>
          </span>
        </span>
        <span className="mt-0.5 block h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.max(2, (value / max) * 100)}%`, backgroundColor: color }}
          />
        </span>
        {sublabel ? <span className="mt-0.5 block truncate font-mono text-[10px] text-zinc-400">{sublabel}</span> : null}
      </span>
      <span className="w-12 text-right text-[12px] font-bold tabular-nums text-zinc-900">{fmtInt(value)}</span>
      <span className="w-14 text-right text-[11px] tabular-nums text-zinc-600">{fmtPercent(percent)}</span>
      {extra !== undefined ? (
        <span className="hidden w-32 text-right text-[11px] tabular-nums text-zinc-600 md:block">{extra}</span>
      ) : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
    </button>
  );
}

function LevelTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-1.5">
      <h4 className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-700">{title}</h4>
      {hint ? <p className="text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function SumCheck({ label, value }: { label: string; value: number }) {
  return (
    <p className="mt-1 px-2 text-right text-[10px] text-zinc-400">
      {label}: <span className="tabular-nums">{fmtInt(value)}</span> OS
    </p>
  );
}

function Breadcrumb({ items }: { items: Array<{ label: string; onClick?: () => void }> }) {
  return (
    <nav aria-label="Caminho do detalhamento" className="mt-0.5">
      <ol className="flex flex-wrap items-center gap-1 text-[11px] text-zinc-500">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="h-3 w-3" aria-hidden /> : null}
            {item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                className="font-semibold text-gold-deep underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              >
                {item.label}
              </button>
            ) : (
              <span aria-current={index === items.length - 1 ? "page" : undefined} className="font-semibold text-zinc-800">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:border-gold/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function componentSublabel(component: FamilyDrilldownComponent, rootTag: string): string | undefined {
  if (component.key === NO_COMPONENT_KEY) {
    return `OS registradas direto em ${rootTag}`;
  }
  return component.registered ? component.key : `${component.key} · TAG não cadastrado no Local de Instalação`;
}

function fmtInt(value: number): string {
  return value.toLocaleString("pt-BR");
}

function fmtHours(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function fmtPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

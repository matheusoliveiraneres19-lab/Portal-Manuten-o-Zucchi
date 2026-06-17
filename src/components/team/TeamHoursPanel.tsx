"use client";

import { useState } from "react";
import { AlertTriangle, CalendarRange, Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { AREA_LABELS, STATUS_LABELS } from "@/components/team/CollaboratorFormModal";
import type { TeamHoursResult } from "@/types/collaborators";

type TeamHoursPanelProps = {
  initial: TeamHoursResult;
};

const inputClass =
  "h-10 rounded-lg border border-white/14 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-gold/70";

export function TeamHoursPanel({ initial }: TeamHoursPanelProps) {
  const [data, setData] = useState<TeamHoursResult>(initial);
  const [startDate, setStartDate] = useState(initial.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(initial.endDate.slice(0, 10));
  const [loading, setLoading] = useState(false);

  async function applyPeriod() {
    if (loading) return;
    if (startDate && endDate && startDate > endDate) {
      toast.error("A data inicial não pode ser maior que a final.");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const response = await fetch(`/api/collaborators/hours?${params.toString()}`);
      if (!response.ok) throw new Error("request failed");
      setData((await response.json()) as TeamHoursResult);
    } catch {
      toast.error("Não foi possível carregar as horas do período.");
    } finally {
      setLoading(false);
    }
  }

  const overallPercent = data.totalGoal > 0 ? (data.totalHours / data.totalGoal) * 100 : null;

  return (
    <div className={`space-y-4 transition ${loading ? "opacity-70" : ""}`}>
      {/* Controle de período */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">De</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Até</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </div>
        <button
          type="button"
          onClick={applyPeriod}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25 disabled:opacity-70"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarRange className="h-4 w-4" />}
          Aplicar período
        </button>
      </div>

      {/* Resumo */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Horas apontadas" value={`${fmt(data.totalHours)} h`} icon={Target} />
        <SummaryCard label="Meta total da equipe" value={`${fmt(data.totalGoal)} h`} icon={Target} />
        <SummaryCard
          label="% da meta"
          value={overallPercent === null ? "—" : `${fmt(overallPercent)}%`}
          icon={Target}
        />
      </section>

      {/* Tabela horas x colaborador */}
      <article className="panel overflow-hidden rounded-lg">
        {data.rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">Nenhum colaborador cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-white/[0.02] text-left text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5">Colaborador</th>
                  <th className="px-4 py-2.5">Área</th>
                  <th className="px-4 py-2.5 text-right">Horas</th>
                  <th className="px-4 py-2.5 text-right">Meta</th>
                  <th className="px-4 py-2.5">% da meta</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-100 text-zinc-800 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold">{row.name}</div>
                      <div className="text-[11px] text-zinc-500">
                        {row.matricula}
                        {row.role ? ` · ${row.role}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{AREA_LABELS[row.area]}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(row.hours)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{fmt(row.monthlyGoal)}</td>
                    <td className="px-4 py-2.5">
                      <GoalBar percent={row.goalPercent} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600">{STATUS_LABELS[row.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {/* Apontamentos sem cadastro */}
      {data.unmatched.length > 0 ? (
        <article className="rounded-lg border border-gold/25 bg-gold/[0.06] p-4">
          <div className="mb-2 flex items-center gap-2 text-gold">
            <AlertTriangle className="h-4 w-4" />
            <h3 className="text-[11px] font-extrabold uppercase tracking-wide">Apontamentos sem colaborador cadastrado</h3>
          </div>
          <p className="mb-3 text-[11px] text-zinc-400">
            Estes nomes têm horas no período mas não casaram com nenhum cadastro. Cadastre-os para que as horas apareçam acima.
          </p>
          <div className="flex flex-wrap gap-2">
            {data.unmatched.map((row) => (
              <span key={row.userName} className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-black/30 px-3 py-1 text-xs text-champagne">
                {row.userName}
                <strong className="text-gold">{fmt(row.hours)} h</strong>
              </span>
            ))}
          </div>
        </article>
      ) : null}
    </div>
  );
}

function GoalBar({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-xs text-zinc-400">—</span>;
  const width = Math.min(100, Math.max(0, percent));
  const tone = percent >= 100 ? "bg-[#3f8f6b]" : percent >= 60 ? "bg-gold" : "bg-danger/70";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <span className="tabular-nums text-xs text-zinc-600">{fmt(percent)}%</span>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Target }) {
  return (
    <div className="panel flex items-center gap-3 rounded-lg p-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div>
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-800">{label}</h3>
        <div className="text-2xl font-light text-zinc-950">{value}</div>
      </div>
    </div>
  );
}

function fmt(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

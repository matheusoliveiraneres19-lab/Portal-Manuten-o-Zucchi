"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Gauge,
  Loader2,
  Palmtree,
  Pencil,
  Scale,
  TriangleAlert
} from "lucide-react";
import { AREA_LABELS, CollaboratorFormModal, STATUS_LABELS } from "@/components/team/CollaboratorFormModal";
import { ChartSkeleton } from "@/components/ChartSkeleton";
import type { CollaboratorDetailData } from "@/types/collaborators";

const CollaboratorHoursChart = dynamic(
  () => import("@/components/team/CollaboratorHoursChart").then((m) => m.CollaboratorHoursChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

const MIN_META = 80;
const MAX_META = 220;

export function CollaboratorDetailPage({ data }: { data: CollaboratorDetailData }) {
  const router = useRouter();
  const { collaborator: c, vacation } = data;
  const [meta, setMeta] = useState(Math.min(MAX_META, Math.max(MIN_META, Math.round(c.monthlyGoal))));
  const [editOpen, setEditOpen] = useState(false);

  const [vacStart, setVacStart] = useState(vacation.vacationStartDate?.slice(0, 10) ?? "");
  const [acqStart, setAcqStart] = useState(vacation.acquisitionPeriodStart?.slice(0, 10) ?? "");
  const [savingVac, setSavingVac] = useState(false);

  async function saveVacation() {
    if (savingVac) return;
    setSavingVac(true);
    try {
      const response = await fetch(`/api/collaborators/${c.id}/vacation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacationStartDate: vacStart || null, acquisitionPeriodStart: acqStart || null })
      });
      const json = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !json?.ok) throw new Error(json?.message ?? "Falha ao salvar férias.");
      toast.success("Férias atualizadas.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSavingVac(false);
    }
  }

  const deficitMonths = data.monthly.filter((m) => m.hours > 0 && m.hours < meta).length;

  return (
    <section className="space-y-4 text-champagne">
      {/* Hero / cabeçalho */}
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-5 shadow-premium sm:p-6">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.15),transparent_22rem)]" />
        <div className="relative z-10">
          <Link href="/dashboard/equipe-horas" className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold transition hover:text-champagne">
            <ArrowLeft className="h-3.5 w-3.5" /> Equipe e Horas
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">{c.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-300">
                <span>{c.role ?? "Função não informada"}</span>
                <span className="text-zinc-500">·</span>
                <span>Turno: {c.shift ?? "—"}</span>
                <span className="text-zinc-500">·</span>
                <span>Matrícula: {c.matricula}</span>
                <span className="text-zinc-500">·</span>
                <span>Área: {AREA_LABELS[c.area]}</span>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${statusTone(c.status)}`}>{STATUS_LABELS[c.status]}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25"
            >
              <Pencil className="h-4 w-4" /> Editar dados
            </button>
          </div>
        </div>
      </header>

      {/* 4 cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Saldo do banco de horas" value={signed(data.accumulatedBalance)} icon={Scale} tone={data.accumulatedBalance >= 0 ? "green" : "red"} />
        <Card label="Horas no mês" value={`${fmt(data.currentMonthHours)} h`} icon={Clock} tone="blue" />
        <Card label="Meta móvel" value={`${meta} h`} icon={Gauge} tone="gold" />
        <Card label="Dias para as férias" value={vacation.daysToVacation === null ? "—" : `${vacation.daysToVacation}`} icon={Palmtree} tone="blue" />
      </section>

      {/* Banco de horas */}
      <article className="panel rounded-lg p-4">
        <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Banco de horas</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Saldo do mês" value={signed(data.monthBalance)} tone={data.monthBalance >= 0 ? "green" : "red"} />
          <Stat label="Saldo acumulado" value={signed(data.accumulatedBalance)} tone={data.accumulatedBalance >= 0 ? "green" : "red"} />
          <Stat label="Horas normais (mês)" value={`${fmt(data.normalHours)} h`} />
          <Stat label="Horas extras (mês)" value={`${fmt(data.extraHours)} h`} tone={data.extraHours > 0 ? "green" : "default"} />
          <Stat label="Falta (mês)" value={`${fmt(data.missingHours)} h`} tone={data.missingHours > 0 ? "red" : "default"} />
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">
          Normais/extras/falta são derivados das horas apontadas (fonte: banco de horas do portal) em relação à meta de {fmt(c.monthlyGoal)} h.
          O saldo acumulado considera os meses com apontamento.
        </p>
      </article>

      {/* Gráfico + meta móvel */}
      <article className="panel rounded-lg p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Horas apontadas por mês</h3>
            <p className="text-[11px] text-zinc-500">
              Barras abaixo da meta em vermelho. {deficitMonths > 0 ? `${deficitMonths} mês(es) abaixo da meta móvel.` : "Nenhum mês abaixo da meta móvel."}
            </p>
          </div>
          <label className="flex items-center gap-3 text-xs text-zinc-600">
            <span className="font-semibold">Meta móvel: {meta} h</span>
            <input
              type="range"
              min={MIN_META}
              max={MAX_META}
              step={5}
              value={meta}
              onChange={(e) => setMeta(Number(e.target.value))}
              className="h-1.5 w-48 cursor-pointer accent-gold"
            />
          </label>
        </div>
        <CollaboratorHoursChart data={data.monthly} meta={meta} />
      </article>

      {/* Férias */}
      <article className="panel rounded-lg p-4">
        <div className="mb-3 flex items-center gap-2">
          <Palmtree className="h-4 w-4 text-[#5a3d12]" />
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Férias</h3>
        </div>

        {vacation.expiringSoon ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <TriangleAlert className="h-4 w-4" />
            Férias a vencer — limite legal de gozo em {fmtDate(vacation.legalLimit)}.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Admissão" value={fmtDate(vacation.admissionDate)} />
          <Stat label="Início período aquisitivo" value={fmtDate(vacation.acquisitionPeriodStart)} />
          <Stat label="Fim período aquisitivo" value={fmtDate(vacation.acquisitionPeriodEnd)} />
          <Stat label="Limite legal de gozo" value={fmtDate(vacation.legalLimit)} tone={vacation.expiringSoon ? "red" : "default"} />
          <Stat label="Início das férias" value={fmtDate(vacation.vacationStartDate)} />
        </div>

        {canEditNote(data.canEditVacation)}

        {data.canEditVacation ? (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-zinc-200/60 pt-3">
            <Field label="Início do período aquisitivo">
              <input type="date" value={acqStart} onChange={(e) => setAcqStart(e.target.value)} className={dateInput} />
            </Field>
            <Field label="Início das férias">
              <input type="date" value={vacStart} onChange={(e) => setVacStart(e.target.value)} className={dateInput} />
            </Field>
            <button
              type="button"
              onClick={saveVacation}
              disabled={savingVac}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25 disabled:opacity-70"
            >
              {savingVac ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              Salvar férias
            </button>
          </div>
        ) : null}
      </article>

      <CollaboratorFormModal open={editOpen} initial={c} onClose={() => setEditOpen(false)} onSaved={() => router.refresh()} />
    </section>
  );
}

const dateInput = "h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-gold";

function canEditNote(canEdit: boolean) {
  if (canEdit) return null;
  return <p className="mt-3 text-[11px] text-zinc-500">Apenas ADMIN/GESTOR podem editar as datas de férias.</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

type Tone = "blue" | "gold" | "red" | "green";
const cardTone: Record<Tone, string> = {
  blue: "bg-petroleum text-white",
  gold: "bg-gold text-white",
  red: "bg-danger text-white",
  green: "bg-[#3f8f6b] text-white"
};

function Card({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Clock; tone: Tone }) {
  return (
    <article className="panel flex min-h-[104px] items-center gap-4 rounded-lg p-4">
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${cardTone[tone]}`}>
        <Icon className="h-6 w-6" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-800">{label}</h3>
        <div className="mt-0.5 truncate text-2xl font-light text-zinc-950" title={value}>{value}</div>
      </div>
    </article>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "green" | "red" }) {
  const valueClass = tone === "green" ? "text-[#2f6e51]" : tone === "red" ? "text-danger" : "text-zinc-900";
  return (
    <div className="rounded-lg border border-zinc-200/70 bg-white/60 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function statusTone(status: CollaboratorDetailData["collaborator"]["status"]): string {
  switch (status) {
    case "ATIVO":
      return "bg-[#3f8f6b]/20 text-[#5fd0a0]";
    case "FERIAS":
      return "bg-petroleum/30 text-sky-300";
    case "AFASTADO":
      return "bg-gold/20 text-gold";
    default:
      return "bg-danger/20 text-rose-300";
  }
}

function fmt(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

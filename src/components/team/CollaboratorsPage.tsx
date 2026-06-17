"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m } from "framer-motion";
import { Loader2, Search, UserPlus, Users } from "lucide-react";
import { AREA_LABELS, CollaboratorFormModal, STATUS_LABELS } from "@/components/team/CollaboratorFormModal";
import { TeamHoursPanel } from "@/components/team/TeamHoursPanel";
import type {
  CollaboratorArea,
  CollaboratorListResult,
  CollaboratorRow,
  CollaboratorStatus,
  TeamHoursResult
} from "@/types/collaborators";

type CollaboratorsPageProps = {
  initial: CollaboratorListResult;
  initialHours: TeamHoursResult;
};

type TabKey = "colaboradores" | "horas";

const STATUS_TONE: Record<CollaboratorStatus, string> = {
  ATIVO: "bg-[#3f8f6b]/15 text-[#5fd0a0]",
  FERIAS: "bg-petroleum/20 text-sky-300",
  AFASTADO: "bg-gold/20 text-gold",
  DESLIGADO: "bg-danger/15 text-rose-300"
};

export function CollaboratorsPage({ initial, initialHours }: CollaboratorsPageProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("colaboradores");
  const [result, setResult] = useState<CollaboratorListResult>(initial);
  const [status, setStatus] = useState<CollaboratorStatus | "">("");
  const [area, setArea] = useState<CollaboratorArea | "">("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CollaboratorRow | null>(null);
  const firstRender = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (area) params.set("area", area);
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/collaborators?${params.toString()}`);
      if (response.ok) setResult((await response.json()) as CollaboratorListResult);
    } finally {
      setLoading(false);
    }
  }, [status, area, search]);

  // Recarrega ao mudar filtros (com debounce para a busca). Pula o 1º render (já temos initial).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openDetail(row: CollaboratorRow) {
    router.push(`/dashboard/equipe/${row.id}`);
  }

  return (
    <section className={`space-y-4 text-champagne transition ${loading ? "opacity-70" : ""}`}>
      {/* Hero */}
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-5 shadow-premium sm:p-6">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.15),transparent_22rem)]" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-3 flex items-center gap-3 text-gold">
              <Users className="h-5 w-5" />
              <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-champagne/80">
                Equipe de manutenção
              </span>
            </div>
            <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Equipe e Horas</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-300">
              Cadastro dos colaboradores da manutenção. As horas apontadas serão casadas por nome nas próximas etapas.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25"
          >
            <UserPlus className="h-4 w-4" /> Registrar novo colaborador
          </button>
        </div>
      </header>

      {/* Abas */}
      <div className="flex gap-1 border-b border-white/10">
        <TabButton active={tab === "colaboradores"} onClick={() => setTab("colaboradores")}>
          Colaboradores
        </TabButton>
        <TabButton active={tab === "horas"} onClick={() => setTab("horas")}>
          Horas da equipe
        </TabButton>
      </div>

      {tab === "horas" ? (
        <TeamHoursPanel initial={initialHours} onGoalsChanged={load} />
      ) : (
        <>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, matrícula ou função"
            className="h-10 w-72 rounded-lg border border-white/14 bg-black/40 pl-9 pr-3 text-sm text-white outline-none transition focus:border-gold/70"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CollaboratorStatus | "")}
          className="h-10 rounded-lg border border-white/14 bg-black/40 px-3 text-sm text-white outline-none focus:border-gold/70"
        >
          <option value="" className="bg-[#0a0b0b]">Todos os status</option>
          {(Object.keys(STATUS_LABELS) as CollaboratorStatus[]).map((s) => (
            <option key={s} value={s} className="bg-[#0a0b0b]">{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={area}
          onChange={(e) => setArea(e.target.value as CollaboratorArea | "")}
          className="h-10 rounded-lg border border-white/14 bg-black/40 px-3 text-sm text-white outline-none focus:border-gold/70"
        >
          <option value="" className="bg-[#0a0b0b]">Todas as áreas</option>
          {(Object.keys(AREA_LABELS) as CollaboratorArea[]).map((a) => (
            <option key={a} value={a} className="bg-[#0a0b0b]">{AREA_LABELS[a]}</option>
          ))}
        </select>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" /> : null}
          {result.total.toLocaleString("pt-BR")} colaborador(es)
        </span>
      </div>

      {/* Tabela */}
      <article className="panel overflow-hidden rounded-lg">
        {result.data.length === 0 ? (
          <div className="grid place-items-center gap-2 px-4 py-16 text-center">
            <Users className="h-8 w-8 text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-300">Nenhum colaborador encontrado</p>
            <p className="text-xs text-zinc-500">Ajuste os filtros ou registre um novo colaborador.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-white/[0.02] text-left text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5">Matrícula</th>
                  <th className="px-4 py-2.5">Nome</th>
                  <th className="px-4 py-2.5">Função</th>
                  <th className="px-4 py-2.5">Área</th>
                  <th className="px-4 py-2.5">Turno</th>
                  <th className="px-4 py-2.5 text-right">Meta (h)</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => openDetail(row)}
                    className="cursor-pointer border-b border-zinc-100 text-zinc-800 transition last:border-0 hover:bg-gold/10"
                    title="Abrir ficha do colaborador"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-600">{row.matricula}</td>
                    <td className="px-4 py-2.5 font-semibold">{row.name}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{row.role ?? "—"}</td>
                    <td className="px-4 py-2.5">{AREA_LABELS[row.area]}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{row.shift ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.monthlyGoal.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${STATUS_TONE[row.status]}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <p className="text-[11px] text-zinc-500">
        <span className="font-semibold text-gold">Dica:</span> clique em uma linha para abrir a ficha do colaborador (horas, banco de horas e férias).
      </p>
        </>
      )}

      <CollaboratorFormModal open={modalOpen} initial={editing} onClose={() => setModalOpen(false)} onSaved={load} />
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2 text-sm font-semibold transition ${
        active ? "text-gold" : "text-zinc-400 hover:text-champagne"
      }`}
    >
      {children}
      {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" /> : null}
    </button>
  );
}

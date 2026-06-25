"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileStack,
  Gauge,
  Library,
  Plus,
  RefreshCw,
  Route,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  X
} from "lucide-react";
import { ProcedureForm } from "@/components/procedures/ProcedureForm";
import { categoryIcon, levelStyle } from "@/components/procedures/shared";
import type {
  OnboardingProgress,
  ProcedureCategoryCount,
  ProcedureListItem,
  ProceduresCenterData,
  ProceduresIndicators
} from "@/types/procedures";

type ProceduresCenterProps = {
  data: ProceduresCenterData;
  canManage: boolean;
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function haystack(procedure: ProcedureListItem): string {
  return normalize(
    [procedure.title, procedure.categoryName, procedure.level, procedure.targetAudience ?? "", procedure.responsible ?? "", ...procedure.tags].join(" ")
  );
}

function detailHref(slug: string): string {
  return `/dashboard/procedimentos/${encodeURIComponent(slug)}`;
}

export function ProceduresCenter({ data, canManage }: ProceduresCenterProps) {
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const tokens = useMemo(() => normalize(query).split(/\s+/).filter(Boolean), [query]);
  const isSearching = tokens.length > 0;

  const results = useMemo(() => {
    if (!isSearching) return [];
    return data.all.filter((procedure) => {
      const hay = haystack(procedure);
      return tokens.every((token) => hay.includes(token));
    });
  }, [tokens, isSearching, data.all]);

  return (
    <section className="space-y-6 text-champagne">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-5 shadow-premium sm:p-7">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.16),transparent_22rem)]" />
        <div className="relative z-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-3 text-gold">
              <Library className="h-5 w-5" />
              <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-champagne/80">
                Central de conhecimento da manutenção
              </span>
            </span>
            {canManage ? (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25"
              >
                <Plus className="h-4 w-4" /> Novo Procedimento
              </button>
            ) : null}
          </div>
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Central de Procedimentos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Consulte o passo a passo das principais atividades do dia a dia da manutenção Zucchi.
          </p>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-zinc-400">
            Encontre orientações rápidas sobre SAP/Fiori, PC-Factory, ordens de serviço, segurança, manutenção mecânica,
            elétrica e lubrificação.
          </p>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gold/80">
            {data.totalPublished} procedimento(s) publicado(s)
          </p>

          {/* Busca */}
          <div className="relative mt-5 max-w-2xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gold" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar procedimento, atividade, sistema ou equipamento..."
              aria-label="Buscar procedimento"
              className="h-14 w-full rounded-xl border border-gold/30 bg-black/50 pl-12 pr-12 text-sm text-champagne shadow-inner outline-none backdrop-blur transition placeholder:text-zinc-500 focus:border-gold/60 focus:ring-2 focus:ring-gold/30 sm:text-base"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca" className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 transition hover:text-white">
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {isSearching ? (
        <SearchResults results={results} query={query} onClear={() => setQuery("")} />
      ) : (
        <>
          <Indicators indicators={data.indicators} />
          <Categories categories={data.categories} onPick={(name) => setQuery(name)} />
          {data.favorites.length > 0 ? <Favorites procedures={data.favorites} /> : null}
          <MostAccessed procedures={data.featured} />
          <OnboardingTrailBlock procedures={data.onboarding} progress={data.onboardingProgress} readIds={data.readIds} />
          <AllProcedures procedures={data.all} />
        </>
      )}

      {canManage ? <ProcedureForm open={formOpen} onClose={() => setFormOpen(false)} /> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Indicadores                                                        */
/* ------------------------------------------------------------------ */

function Indicators({ indicators }: { indicators: ProceduresIndicators }) {
  const cards = [
    { icon: <Library className="h-4 w-4" />, label: "Publicados", value: String(indicators.totalPublished) },
    { icon: <TrendingUp className="h-4 w-4" />, label: "Mais acessado", value: indicators.mostAccessedTitle ?? "—", small: true },
    { icon: <Clock className="h-4 w-4" />, label: "Pendentes de leitura", value: String(indicators.pendingReadCount) },
    { icon: <Route className="h-4 w-4" />, label: "Progresso funcionário novo", value: `${indicators.onboardingPercent}%` },
    { icon: <FileStack className="h-4 w-4" />, label: "Com anexos", value: String(indicators.withAttachmentsCount) },
    { icon: <RefreshCw className="h-4 w-4" />, label: "Atualizados (30d)", value: String(indicators.recentlyUpdatedCount) }
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-gold/15 bg-black/40 p-3 backdrop-blur">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold/80">
            {card.icon}
            <span className="truncate">{card.label}</span>
          </div>
          <div className={`font-bold text-white ${card.small ? "truncate text-[13px]" : "text-xl tabular-nums"}`} title={card.value}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Meus favoritos                                                     */
/* ------------------------------------------------------------------ */

function Favorites({ procedures }: { procedures: ProcedureListItem[] }) {
  return (
    <div>
      <SectionTitle icon={<Star className="h-4 w-4" />} title="Meus favoritos" subtitle="Procedimentos que você marcou para acesso rápido." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {procedures.map((procedure) => (
          <ProcedureCard key={procedure.id} procedure={procedure} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Categorias                                                         */
/* ------------------------------------------------------------------ */

function Categories({ categories, onPick }: { categories: ProcedureCategoryCount[]; onPick: (name: string) => void }) {
  return (
    <div>
      <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Categorias" subtitle="Navegue pelos principais temas da rotina de manutenção." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {categories.map((category) => {
          const Icon = categoryIcon(category.name);
          return (
            <button
              key={category.name}
              type="button"
              onClick={() => onPick(category.name)}
              className="group flex h-full flex-col rounded-lg border border-gold/20 bg-black/40 p-4 text-left backdrop-blur transition hover:-translate-y-0.5 hover:border-gold/45 hover:bg-black/55"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-lg border border-gold/35 bg-gold/10 text-gold transition group-hover:bg-gold/20">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="rounded-full border border-gold/25 bg-black/40 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-champagne/80">
                  {category.count}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white">{category.name}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{category.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gold opacity-0 transition group-hover:opacity-100">
                Ver procedimentos <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mais acessados                                                     */
/* ------------------------------------------------------------------ */

function MostAccessed({ procedures }: { procedures: ProcedureListItem[] }) {
  if (procedures.length === 0) return null;
  return (
    <div>
      <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Mais acessados" subtitle="Os procedimentos mais consultados pela equipe." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {procedures.map((procedure) => (
          <ProcedureCard key={procedure.id} procedure={procedure} />
        ))}
      </div>
    </div>
  );
}

function ProcedureCard({ procedure }: { procedure: ProcedureListItem }) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-gold/20 bg-black/40 p-4 backdrop-blur transition hover:border-gold/45">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-champagne">
          {procedure.categoryName}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${levelStyle(procedure.level)}`}>
          {procedure.level}
        </span>
      </div>
      <h3 className="text-sm font-bold leading-snug text-white">{procedure.title}</h3>
      <dl className="mt-3 space-y-1.5 text-[12px] text-zinc-400">
        {procedure.estimatedMinutes != null ? (
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-gold" />
            <span>{procedure.estimatedMinutes} min de leitura</span>
          </div>
        ) : null}
        {procedure.targetAudience ? (
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-gold" />
            <span>{procedure.targetAudience}</span>
          </div>
        ) : null}
      </dl>
      <Link
        href={detailHref(procedure.slug)}
        className="mt-4 inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-gold/45 bg-gold/15 px-3 text-[12px] font-bold text-gold transition hover:bg-gold/25"
      >
        <BookOpen className="h-4 w-4" /> Ver passo a passo
      </Link>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Trilha — funcionário novo                                          */
/* ------------------------------------------------------------------ */

function OnboardingTrailBlock({
  procedures,
  progress,
  readIds
}: {
  procedures: ProcedureListItem[];
  progress: OnboardingProgress;
  readIds: string[];
}) {
  if (procedures.length === 0) return null;
  const readSet = new Set(readIds);
  // Inicia na primeira pendente; se tudo concluído, na primeira.
  const firstPending = procedures.find((procedure) => !readSet.has(procedure.id)) ?? procedures[0];

  return (
    <div className="relative overflow-hidden rounded-lg border border-gold/25 bg-[#0a0b0b] p-5 shadow-premium sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_92%_0%,rgba(196,154,69,0.14),transparent_20rem)]" />
      <div className="relative z-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <SectionTitle
            icon={<Route className="h-4 w-4" />}
            title="Primeiros passos para funcionário novo"
            subtitle="Uma trilha rápida para entender como a manutenção trabalha dentro da Zucchi."
            flush
          />
          <Link
            href={detailHref(firstPending.slug)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25"
          >
            <Route className="h-4 w-4" /> {progress.completed > 0 ? "Continuar trilha" : "Iniciar trilha"}
          </Link>
        </div>

        {/* Progresso */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-champagne">
            <span>{progress.completed} de {progress.total} concluídos</span>
            <span className="text-gold">{progress.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/50">
            <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>

        <ol className="mt-5 space-y-2.5">
          {procedures.map((procedure, index) => {
            const done = readSet.has(procedure.id);
            return (
              <li key={procedure.id}>
                <Link
                  href={detailHref(procedure.slug)}
                  className="group flex w-full items-center gap-3 rounded-lg border border-gold/15 bg-black/40 px-4 py-3 text-left transition hover:border-gold/40 hover:bg-black/55"
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border font-serif text-sm font-bold ${
                      done ? "border-[#3f8f6b]/50 bg-[#3f8f6b]/20 text-[#7fd0ab]" : "border-gold/40 bg-gold/10 text-gold"
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </span>
                  <span className="flex-1 text-sm font-semibold text-champagne">{procedure.title}</span>
                  {done ? <span className="text-[11px] font-semibold uppercase tracking-wide text-[#7fd0ab]">Lido</span> : null}
                  <ArrowRight className="h-4 w-4 text-gold opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Todos os procedimentos                                             */
/* ------------------------------------------------------------------ */

function AllProcedures({ procedures }: { procedures: ProcedureListItem[] }) {
  return (
    <div>
      <SectionTitle icon={<Library className="h-4 w-4" />} title="Todos os procedimentos" subtitle="Lista completa de procedimentos disponíveis." />

      {procedures.length === 0 ? (
        <div className="rounded-lg border border-gold/20 bg-black/40 p-8 text-center text-sm text-zinc-400 backdrop-blur">
          Ainda não há procedimentos publicados. Use “Novo Procedimento” para cadastrar o primeiro.
        </div>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden overflow-hidden rounded-lg border border-gold/15 bg-black/30 backdrop-blur md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gold/20 text-left text-[11px] font-extrabold uppercase tracking-wide text-gold/80">
                    <th className="px-4 py-3">Procedimento</th>
                    <th className="px-3 py-3">Categoria</th>
                    <th className="px-3 py-3">Nível</th>
                    <th className="px-3 py-3 text-right">Leitura</th>
                    <th className="px-3 py-3">Responsável</th>
                    <th className="px-3 py-3">Atualização</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {procedures.map((procedure) => (
                    <tr key={procedure.id} className="border-b border-gold/10 text-zinc-200 transition last:border-0 hover:bg-gold/5">
                      <td className="px-4 py-3 font-semibold text-white">{procedure.title}</td>
                      <td className="px-3 py-3 text-zinc-300">{procedure.categoryName}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${levelStyle(procedure.level)}`}>
                          {procedure.level}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-300">
                        {procedure.estimatedMinutes != null ? `${procedure.estimatedMinutes} min` : "—"}
                      </td>
                      <td className="px-3 py-3 text-zinc-300">{procedure.responsible ?? "—"}</td>
                      <td className="px-3 py-3 tabular-nums text-zinc-400">{formatDate(procedure.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={detailHref(procedure.slug)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gold/40 px-3 text-[12px] font-bold text-gold transition hover:bg-gold/15"
                        >
                          Ver <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {procedures.map((procedure) => (
              <article key={procedure.id} className="rounded-lg border border-gold/20 bg-black/40 p-4 backdrop-blur">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-champagne">
                    {procedure.categoryName}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${levelStyle(procedure.level)}`}>
                    {procedure.level}
                  </span>
                </div>
                <h3 className="text-sm font-bold leading-snug text-white">{procedure.title}</h3>
                <p className="mt-2 text-[12px] text-zinc-400">
                  {procedure.estimatedMinutes != null ? `${procedure.estimatedMinutes} min · ` : ""}
                  {procedure.responsible ?? "—"} · atualizado em {formatDate(procedure.updatedAt)}
                </p>
                <Link
                  href={detailHref(procedure.slug)}
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-gold/40 px-3 text-[12px] font-bold text-gold transition hover:bg-gold/15"
                >
                  Ver <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resultados da busca + empty state                                  */
/* ------------------------------------------------------------------ */

function SearchResults({ results, query, onClear }: { results: ProcedureListItem[]; query: string; onClear: () => void }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Search className="h-4 w-4 text-gold" />
          Resultados para <span className="text-gold">“{query}”</span>
          <span className="text-[12px] font-normal text-zinc-500">· {results.length} encontrado(s)</span>
        </h2>
        <button type="button" onClick={onClear} className="text-[12px] font-semibold text-gold transition hover:text-champagne">
          Limpar busca
        </button>
      </div>

      {results.length === 0 ? (
        <div className="rounded-lg border border-gold/20 bg-black/40 p-10 text-center backdrop-blur">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
            <Gauge className="h-6 w-6" />
          </span>
          <p className="text-base font-semibold text-white">Nenhum procedimento encontrado para sua busca.</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-zinc-400">
            Tente buscar por SAP, OS, PC-Factory, segurança, mecânica, elétrica ou lubrificação.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((procedure) => (
            <ProcedureCard key={procedure.id} procedure={procedure} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Auxiliares                                                         */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function SectionTitle({ icon, title, subtitle, flush = false }: { icon: React.ReactNode; title: string; subtitle?: string; flush?: boolean }) {
  return (
    <div className={flush ? "" : "mb-3"}>
      <h2 className="flex items-center gap-2 font-serif text-xl text-white">
        <span className="text-gold">{icon}</span>
        {title}
      </h2>
      {subtitle ? <p className="mt-0.5 text-[13px] text-zinc-400">{subtitle}</p> : null}
    </div>
  );
}

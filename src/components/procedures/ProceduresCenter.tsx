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

/* Classes de contraste premium reutilizadas (fundo escuro + dourado, alta legibilidade). */
const CARD = "rounded-xl border border-[#C6A24A]/30 bg-gradient-to-br from-[#1B1812] to-[#0E0D0A] shadow-[0_16px_40px_rgba(0,0,0,0.35)]";
const CARD_HOVER = "transition hover:border-[#D6AA3A]/70 hover:bg-[#1F1B13]";
const BADGE = "rounded-full border border-[#D6AA3A]/35 bg-[#D6AA3A]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#F6D98B]";
const TXT_TITLE = "text-[#F8F3E7]";
const TXT_DESC = "text-[#D7CDBA]";
const TXT_MUTED = "text-[#B8AD9A]";
const TXT_GOLD = "text-[#D6AA3A]";

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
    <section className="space-y-6 text-[#F8F3E7]">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border border-[#C6A24A]/30 bg-gradient-to-br from-[#11100C] via-[#0B0A08] to-[#050504] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.4)] sm:p-7">
        <div className="login-marble-bg absolute inset-0 opacity-10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(214,170,58,0.14),transparent_22rem)]" />
        <div className="relative z-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <span className={`inline-flex items-center gap-3 ${TXT_GOLD}`}>
              <Library className="h-5 w-5" />
              <span className="rounded-md border border-[#D6AA3A]/40 bg-[#D6AA3A]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#F6D98B]">
                Central de conhecimento da manutenção
              </span>
            </span>
            {canManage ? (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D6AA3A]/60 bg-[#D6AA3A]/15 px-4 text-sm font-bold text-[#F6D98B] transition hover:bg-[#D6AA3A]/25"
              >
                <Plus className="h-4 w-4" /> Novo Procedimento
              </button>
            ) : null}
          </div>
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Central de Procedimentos</h1>
          <p className={`mt-2 max-w-3xl text-sm leading-relaxed sm:text-base ${TXT_DESC}`}>
            Consulte o passo a passo das principais atividades do dia a dia da manutenção Zucchi.
          </p>
          <p className={`mt-1 max-w-3xl text-[13px] leading-relaxed ${TXT_MUTED}`}>
            Encontre orientações rápidas sobre SAP/Fiori, PC-Factory, ordens de serviço, segurança, manutenção mecânica,
            elétrica e lubrificação.
          </p>
          <p className={`mt-3 text-[11px] font-semibold uppercase tracking-wide ${TXT_GOLD}`}>
            {data.totalPublished} procedimento(s) publicado(s)
          </p>

          {/* Busca */}
          <div className="relative mt-5 max-w-2xl">
            <Search className={`pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 ${TXT_GOLD}`} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar procedimento, atividade, sistema ou equipamento..."
              aria-label="Buscar procedimento"
              className="h-14 w-full rounded-2xl border border-[#C6A24A]/30 bg-[#11100C] pl-12 pr-12 text-sm text-[#F8F3E7] outline-none transition placeholder:text-[#8F846F] focus:border-[#D6AA3A] focus:ring-2 focus:ring-[#D6AA3A]/20 sm:text-base"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca" className={`absolute right-4 top-1/2 -translate-y-1/2 ${TXT_MUTED} transition hover:text-white`}>
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
          <OnboardingTrailBlock procedures={data.onboarding} progress={data.onboardingProgress} readIds={data.readIds} />
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
        <div
          key={card.label}
          className="rounded-2xl border border-[#C6A24A]/25 bg-gradient-to-br from-[#18150F] to-[#0D0C09] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
        >
          <div className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${TXT_GOLD}`}>
            {card.icon}
            <span className="truncate">{card.label}</span>
          </div>
          <div className={`font-bold text-white ${card.small ? "truncate text-[13px]" : "mt-1 text-2xl tabular-nums"}`} title={card.value}>
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
              className="group flex h-full flex-col rounded-2xl border border-[#C6A24A]/25 bg-gradient-to-br from-[#1A1710] via-[#14120D] to-[#0B0A08] p-5 text-left shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-1 hover:border-[#D6AA3A]/70 hover:shadow-[0_22px_55px_rgba(0,0,0,0.45)]"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className={`grid h-11 w-11 place-items-center rounded-xl border border-[#D6AA3A]/35 bg-[#D6AA3A]/12 ${TXT_GOLD} transition group-hover:bg-[#D6AA3A]/22`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className={BADGE + " tabular-nums"}>{category.count}</span>
              </div>
              <h3 className={`text-base font-semibold ${TXT_TITLE}`}>{category.name}</h3>
              <p className={`mt-2 text-sm leading-relaxed ${TXT_DESC}`}>{category.description}</p>
              <span className={`mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${TXT_GOLD} opacity-0 transition group-hover:opacity-100`}>
                Ver procedimentos <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProcedureCard({ procedure }: { procedure: ProcedureListItem }) {
  return (
    <article className={`flex h-full flex-col p-4 ${CARD} ${CARD_HOVER}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D6AA3A]/35 bg-[#D6AA3A]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#F6D98B]">
          {procedure.categoryName}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${levelStyle(procedure.level)}`}>
          {procedure.level}
        </span>
      </div>
      <h3 className={`text-sm font-semibold leading-snug ${TXT_TITLE}`}>{procedure.title}</h3>
      <dl className={`mt-3 space-y-1.5 text-[12px] ${TXT_DESC}`}>
        {procedure.estimatedMinutes != null ? (
          <div className="flex items-center gap-2">
            <Clock className={`h-3.5 w-3.5 ${TXT_GOLD}`} />
            <span>{procedure.estimatedMinutes} min de leitura</span>
          </div>
        ) : null}
        {procedure.targetAudience ? (
          <div className="flex items-center gap-2">
            <Users className={`h-3.5 w-3.5 ${TXT_GOLD}`} />
            <span>{procedure.targetAudience}</span>
          </div>
        ) : null}
      </dl>
      <Link
        href={detailHref(procedure.slug)}
        className="mt-4 inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-[#D6AA3A]/50 bg-[#D6AA3A]/15 px-3 text-[12px] font-bold text-[#F6D98B] transition hover:bg-[#D6AA3A]/25"
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
    <div className="relative overflow-hidden rounded-2xl border border-[#C6A24A]/30 bg-gradient-to-br from-[#1B1812] to-[#0B0A08] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.4)] sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_92%_0%,rgba(214,170,58,0.12),transparent_20rem)]" />
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
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[#D6AA3A]/60 bg-[#D6AA3A]/15 px-4 text-sm font-bold text-[#F6D98B] transition hover:bg-[#D6AA3A]/25"
          >
            <Route className="h-4 w-4" /> {progress.completed > 0 ? "Continuar trilha" : "Iniciar trilha"}
          </Link>
        </div>

        {/* Progresso */}
        <div className="mt-4">
          <div className={`mb-1.5 flex items-center justify-between text-[12px] font-semibold ${TXT_TITLE}`}>
            <span>{progress.completed} de {progress.total} concluídos</span>
            <span className={TXT_GOLD}>{progress.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/60">
            <div className="h-full rounded-full bg-[#D6AA3A] transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>

        <ol className="mt-5 space-y-2.5">
          {procedures.map((procedure, index) => {
            const done = readSet.has(procedure.id);
            return (
              <li key={procedure.id}>
                <Link
                  href={detailHref(procedure.slug)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-[#C6A24A]/20 bg-[#15130E] px-4 py-3 text-left transition hover:border-[#D6AA3A]/55 hover:bg-[#1F1B13]"
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border font-serif text-sm font-bold ${
                      done ? "border-[#3f8f6b]/55 bg-[#3f8f6b]/20 text-[#9be3c1]" : "border-[#D6AA3A]/45 bg-[#D6AA3A]/12 text-[#F6D98B]"
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </span>
                  <span className={`flex-1 text-sm font-semibold ${TXT_TITLE}`}>{procedure.title}</span>
                  {done ? <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9be3c1]">Lido</span> : null}
                  <ArrowRight className={`h-4 w-4 ${TXT_GOLD} opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100`} />
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
/* Resultados da busca + empty state                                  */
/* ------------------------------------------------------------------ */

function SearchResults({ results, query, onClear }: { results: ProcedureListItem[]; query: string; onClear: () => void }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`flex items-center gap-2 text-sm font-bold ${TXT_TITLE}`}>
          <Search className={`h-4 w-4 ${TXT_GOLD}`} />
          Resultados para <span className={TXT_GOLD}>“{query}”</span>
          <span className={`text-[12px] font-normal ${TXT_MUTED}`}>· {results.length} encontrado(s)</span>
        </h2>
        <button type="button" onClick={onClear} className={`text-[12px] font-semibold ${TXT_GOLD} transition hover:text-white`}>
          Limpar busca
        </button>
      </div>

      {results.length === 0 ? (
        <div className={`p-10 text-center ${CARD}`}>
          <span className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full border border-[#D6AA3A]/35 bg-[#D6AA3A]/12 ${TXT_GOLD}`}>
            <Gauge className="h-6 w-6" />
          </span>
          <p className={`text-base font-semibold ${TXT_TITLE}`}>Nenhum procedimento encontrado para sua busca.</p>
          <p className={`mx-auto mt-2 max-w-md text-[13px] ${TXT_DESC}`}>
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

function SectionTitle({ icon, title, subtitle, flush = false }: { icon: React.ReactNode; title: string; subtitle?: string; flush?: boolean }) {
  return (
    <div className={flush ? "" : "mb-3"}>
      <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold text-[#F8F3E7]">
        <span className={TXT_GOLD}>{icon}</span>
        {title}
      </h2>
      {subtitle ? <p className="mt-0.5 text-sm text-[#CFC3AE]">{subtitle}</p> : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Gauge,
  Library,
  Route,
  Search,
  Sparkles,
  Users,
  X
} from "lucide-react";
import {
  CATEGORY_BY_SLUG,
  ONBOARDING_TRAIL,
  PROCEDURES,
  PROCEDURE_CATEGORIES,
  type Procedure,
  type ProcedureLevel
} from "@/data/procedures";

/** Remove acentos e caixa para a busca tolerante. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Texto pesquisável de um procedimento (título + categoria + nível + público + tags). */
function haystack(procedure: Procedure): string {
  return normalize(
    [
      procedure.title,
      CATEGORY_BY_SLUG[procedure.categorySlug].name,
      procedure.level,
      procedure.audience,
      procedure.responsible,
      ...procedure.tags
    ].join(" ")
  );
}

/** Fase 01: ainda não há conteúdo navegável — apenas confirma a ação ao usuário. */
function comingSoon() {
  toast("Conteúdo disponível na próxima fase.", { description: "Os passo a passo serão publicados em breve." });
}

const LEVEL_STYLES: Record<ProcedureLevel, string> = {
  Básico: "border-[#3f8f6b]/40 bg-[#3f8f6b]/15 text-[#7fd0ab]",
  Intermediário: "border-gold/40 bg-gold/15 text-champagne",
  Avançado: "border-danger/40 bg-danger/15 text-danger"
};

export function ProceduresCenter() {
  const [query, setQuery] = useState("");

  const tokens = useMemo(() => normalize(query).split(/\s+/).filter(Boolean), [query]);
  const isSearching = tokens.length > 0;

  const results = useMemo(() => {
    if (!isSearching) return [];
    return PROCEDURES.filter((procedure) => {
      const hay = haystack(procedure);
      return tokens.every((token) => hay.includes(token));
    });
  }, [tokens, isSearching]);

  const popular = useMemo(() => PROCEDURES.filter((procedure) => procedure.popular), []);

  return (
    <section className="space-y-6 text-champagne">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-5 shadow-premium sm:p-7">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.16),transparent_22rem)]" />
        <div className="relative z-10">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-gold">
            <Library className="h-5 w-5" />
            <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-champagne/80">
              Central de conhecimento da manutenção
            </span>
          </div>
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Central de Procedimentos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Consulte o passo a passo das principais atividades do dia a dia da manutenção Zucchi.
          </p>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-zinc-400">
            Encontre orientações rápidas sobre SAP/Fiori, PC-Factory, ordens de serviço, segurança, manutenção mecânica,
            elétrica e lubrificação.
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
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 transition hover:text-white"
              >
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
          <Categories />
          <MostAccessed procedures={popular} />
          <OnboardingTrailBlock />
          <AllProcedures procedures={PROCEDURES} />
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Categorias                                                         */
/* ------------------------------------------------------------------ */

function Categories() {
  return (
    <div>
      <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Categorias" subtitle="Navegue pelos principais temas da rotina de manutenção." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {PROCEDURE_CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <button
              key={category.slug}
              type="button"
              onClick={comingSoon}
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

function MostAccessed({ procedures }: { procedures: Procedure[] }) {
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

function ProcedureCard({ procedure }: { procedure: Procedure }) {
  const category = CATEGORY_BY_SLUG[procedure.categorySlug];
  return (
    <article className="flex h-full flex-col rounded-lg border border-gold/20 bg-black/40 p-4 backdrop-blur transition hover:border-gold/45">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-champagne">
          {category.name}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LEVEL_STYLES[procedure.level]}`}>
          {procedure.level}
        </span>
      </div>
      <h3 className="text-sm font-bold leading-snug text-white">{procedure.title}</h3>
      <dl className="mt-3 space-y-1.5 text-[12px] text-zinc-400">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-gold" />
          <span>{procedure.readingMinutes} min de leitura</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-gold" />
          <span>{procedure.audience}</span>
        </div>
      </dl>
      <button
        type="button"
        onClick={comingSoon}
        className="mt-4 inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-gold/45 bg-gold/15 px-3 text-[12px] font-bold text-gold transition hover:bg-gold/25"
      >
        <BookOpen className="h-4 w-4" /> Ver passo a passo
      </button>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Trilha — funcionário novo                                          */
/* ------------------------------------------------------------------ */

function OnboardingTrailBlock() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-gold/25 bg-[#0a0b0b] p-5 shadow-premium sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_92%_0%,rgba(196,154,69,0.14),transparent_20rem)]" />
      <div className="relative z-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <SectionTitle
              icon={<Route className="h-4 w-4" />}
              title="Primeiros passos para funcionário novo"
              subtitle="Uma trilha rápida para entender como a manutenção trabalha dentro da Zucchi."
              flush
            />
          </div>
          <button
            type="button"
            onClick={comingSoon}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25"
          >
            <Route className="h-4 w-4" /> Iniciar trilha
          </button>
        </div>

        <ol className="mt-5 space-y-2.5">
          {ONBOARDING_TRAIL.map((step) => (
            <li key={step.order}>
              <button
                type="button"
                onClick={comingSoon}
                className="group flex w-full items-center gap-3 rounded-lg border border-gold/15 bg-black/40 px-4 py-3 text-left transition hover:border-gold/40 hover:bg-black/55"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold/10 font-serif text-sm font-bold text-gold">
                  {step.order}
                </span>
                <span className="flex-1 text-sm font-semibold text-champagne">{step.title}</span>
                <ArrowRight className="h-4 w-4 text-gold opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Todos os procedimentos                                             */
/* ------------------------------------------------------------------ */

function AllProcedures({ procedures }: { procedures: Procedure[] }) {
  return (
    <div>
      <SectionTitle icon={<Library className="h-4 w-4" />} title="Todos os procedimentos" subtitle="Lista completa de procedimentos disponíveis." />

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
              {procedures.map((procedure) => {
                const category = CATEGORY_BY_SLUG[procedure.categorySlug];
                return (
                  <tr key={procedure.id} className="border-b border-gold/10 text-zinc-200 transition last:border-0 hover:bg-gold/5">
                    <td className="px-4 py-3 font-semibold text-white">{procedure.title}</td>
                    <td className="px-3 py-3 text-zinc-300">{category.name}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LEVEL_STYLES[procedure.level]}`}>
                        {procedure.level}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-300">{procedure.readingMinutes} min</td>
                    <td className="px-3 py-3 text-zinc-300">{procedure.responsible}</td>
                    <td className="px-3 py-3 tabular-nums text-zinc-400">{procedure.updatedAt}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={comingSoon}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gold/40 px-3 text-[12px] font-bold text-gold transition hover:bg-gold/15"
                      >
                        Ver <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
        {procedures.map((procedure) => {
          const category = CATEGORY_BY_SLUG[procedure.categorySlug];
          return (
            <article key={procedure.id} className="rounded-lg border border-gold/20 bg-black/40 p-4 backdrop-blur">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-champagne">
                  {category.name}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LEVEL_STYLES[procedure.level]}`}>
                  {procedure.level}
                </span>
              </div>
              <h3 className="text-sm font-bold leading-snug text-white">{procedure.title}</h3>
              <p className="mt-2 text-[12px] text-zinc-400">
                {procedure.readingMinutes} min · {procedure.responsible} · atualizado em {procedure.updatedAt}
              </p>
              <button
                type="button"
                onClick={comingSoon}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-gold/40 px-3 text-[12px] font-bold text-gold transition hover:bg-gold/15"
              >
                Ver <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resultados da busca + empty state                                  */
/* ------------------------------------------------------------------ */

function SearchResults({ results, query, onClear }: { results: Procedure[]; query: string; onClear: () => void }) {
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
/* Título de seção                                                    */
/* ------------------------------------------------------------------ */

function SectionTitle({
  icon,
  title,
  subtitle,
  flush = false
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  flush?: boolean;
}) {
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

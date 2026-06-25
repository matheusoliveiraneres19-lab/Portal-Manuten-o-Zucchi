import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, Eye, Gauge, RefreshCw, Tag, UserCog, Users } from "lucide-react";
import { ProcedureDetailActions } from "@/components/procedures/ProcedureDetailActions";
import { categoryIcon, levelStyle } from "@/components/procedures/shared";
import { getProcedureBySlug, incrementProcedureView } from "@/services/procedures.service";
import { getSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

type DetailPageProps = { params: { slug: string } };

export async function generateMetadata({ params }: DetailPageProps): Promise<Metadata> {
  const detail = await getProcedureBySlug(params.slug);
  return { title: `${detail?.title ?? "Procedimento"} | Central de Procedimentos` };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default async function ProcedureDetailPage({ params }: DetailPageProps) {
  const detail = await getProcedureBySlug(params.slug);
  if (!detail) notFound();

  const session = await getSession();
  const canManage = session?.role === "ADMIN" || session?.role === "GESTOR";

  // Contador de visualização (best-effort — nunca quebra a renderização).
  await incrementProcedureView(detail.id);

  const Icon = categoryIcon(detail.categoryName);

  return (
    <article className="mx-auto max-w-4xl space-y-5 text-champagne">
      <ProcedureDetailActions detail={detail} canManage={canManage} />

      {/* Cabeçalho */}
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-5 shadow-premium sm:p-7">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.8),rgba(0,0,0,0.5))]" />
        <div className="relative z-10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/35 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-champagne">
              <Icon className="h-3.5 w-3.5 text-gold" /> {detail.categoryName}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${levelStyle(detail.level)}`}>{detail.level}</span>
            {detail.status !== "Publicado" ? (
              <span className="rounded-full border border-zinc-500/40 bg-zinc-500/15 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">{detail.status}</span>
            ) : null}
          </div>
          <h1 className="font-serif text-2xl leading-tight text-white sm:text-3xl">{detail.title}</h1>
          {detail.summary ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">{detail.summary}</p> : null}

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-zinc-400">
            {detail.estimatedMinutes != null ? <Meta icon={<Clock className="h-3.5 w-3.5" />} text={`${detail.estimatedMinutes} min de leitura`} /> : null}
            {detail.targetAudience ? <Meta icon={<Users className="h-3.5 w-3.5" />} text={detail.targetAudience} /> : null}
            {detail.responsible ? <Meta icon={<UserCog className="h-3.5 w-3.5" />} text={`Responsável: ${detail.responsible}`} /> : null}
            <Meta icon={<RefreshCw className="h-3.5 w-3.5" />} text={`Atualizado em ${formatDate(detail.updatedAt)}`} />
            <Meta icon={<Eye className="h-3.5 w-3.5" />} text={`${detail.viewCount.toLocaleString("pt-BR")} visualizações`} />
          </div>
        </div>
      </header>

      {/* Corpo */}
      <div className="space-y-4">
        {detail.objective ? <Block title="Objetivo">{detail.objective}</Block> : null}
        {detail.whenToUse ? <Block title="Quando usar">{detail.whenToUse}</Block> : null}

        <section className="rounded-lg border border-gold/20 bg-black/40 p-5 backdrop-blur">
          <h2 className="mb-3 flex items-center gap-2 font-serif text-lg text-white">
            <Gauge className="h-4 w-4 text-gold" /> Passo a passo
          </h2>
          {detail.content ? (
            <div className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">{detail.content}</div>
          ) : (
            <p className="text-sm text-zinc-500">Conteúdo não informado.</p>
          )}
        </section>

        {detail.commonMistakes ? <Block title="Erros comuns" tone="danger">{detail.commonMistakes}</Block> : null}

        {detail.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Tag className="h-4 w-4 text-gold" />
            {detail.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-gold/25 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-champagne">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-gold">{icon}</span>
      {text}
    </span>
  );
}

function Block({ title, children, tone = "default" }: { title: string; children: React.ReactNode; tone?: "default" | "danger" }) {
  return (
    <section className={`rounded-lg border p-5 backdrop-blur ${tone === "danger" ? "border-danger/30 bg-danger/5" : "border-gold/20 bg-black/40"}`}>
      <h2 className={`mb-2 font-serif text-lg ${tone === "danger" ? "text-danger" : "text-white"}`}>{title}</h2>
      <div className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">{children}</div>
    </section>
  );
}

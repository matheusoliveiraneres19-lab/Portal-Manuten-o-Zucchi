import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, Clock, Eye, Gauge, RefreshCw, Tag, UserCog, Users } from "lucide-react";
import { ProcedureDetailActions } from "@/components/procedures/ProcedureDetailActions";
import { ProcedureAttachments } from "@/components/procedures/ProcedureAttachments";
import { ProcedureTabs } from "@/components/procedures/ProcedureTabs";
import { ProcedureVideoLesson } from "@/components/procedures/ProcedureVideoLesson";
import { ProcedureVideoManager } from "@/components/procedures/ProcedureVideoManager";
import { categoryIcon, levelStyle } from "@/components/procedures/shared";
import { getProcedureBySlug, getProcedureDetailForUser, incrementProcedureView } from "@/services/procedures.service";
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
  const session = await getSession();
  const canManage = session?.role === "ADMIN" || session?.role === "GESTOR";

  const detail = await getProcedureDetailForUser(params.slug, session?.sub ?? null);
  if (!detail) notFound();

  // Contador de visualização (best-effort — nunca quebra a renderização).
  await incrementProcedureView(detail.id);

  const Icon = categoryIcon(detail.categoryName);

  // Separa anexos: vídeos vão para a aba Videoaula; o restante (PDF/imagem/doc)
  // para Materiais de apoio. O vídeo principal é o primeiro anexo de vídeo.
  const videoAttachments = detail.attachments.filter((item) => item.kind === "video");
  const materialAttachments = detail.attachments.filter((item) => item.kind !== "video");
  const mainVideo = videoAttachments[0] ?? null;
  const extraVideos = videoAttachments.slice(1);
  const videoTitle = mainVideo && mainVideo.fileName !== mainVideo.url ? mainVideo.fileName : undefined;

  const videoManager = canManage ? (
    <ProcedureVideoManager
      slug={detail.slug}
      current={
        mainVideo
          ? {
              id: mainVideo.id,
              title: videoTitle ?? "",
              url: mainVideo.url,
              description: mainVideo.description,
              isExternal: mainVideo.isExternal
            }
          : null
      }
    />
  ) : null;

  return (
    <article className="mx-auto max-w-4xl space-y-5 text-[#F8F3E7]">
      <ProcedureDetailActions detail={detail} canManage={canManage} isFavorite={detail.isFavorite} readConfirmedAt={detail.readConfirmedAt} />

      {/* Cabeçalho */}
      <header className="relative overflow-hidden rounded-2xl border border-[#C6A24A]/30 bg-gradient-to-br from-[#11100C] via-[#0B0A08] to-[#050504] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.4)] sm:p-7">
        <div className="login-marble-bg absolute inset-0 opacity-10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(214,170,58,0.12),transparent_22rem)]" />
        <div className="relative z-10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D6AA3A]/35 bg-[#D6AA3A]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#F6D98B]">
              <Icon className="h-3.5 w-3.5 text-[#D6AA3A]" /> {detail.categoryName}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${levelStyle(detail.level)}`}>{detail.level}</span>
            {detail.status !== "Publicado" ? (
              <span className="rounded-full border border-[#B8AD9A]/40 bg-[#B8AD9A]/15 px-2 py-0.5 text-[11px] font-semibold text-[#D7CDBA]">{detail.status}</span>
            ) : null}
          </div>
          <h1 className="font-serif text-2xl leading-tight text-white sm:text-3xl">{detail.title}</h1>
          {detail.summary ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#D7CDBA]">{detail.summary}</p> : null}

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-[#B8AD9A]">
            {detail.estimatedMinutes != null ? <Meta icon={<Clock className="h-3.5 w-3.5" />} text={`${detail.estimatedMinutes} min de leitura`} /> : null}
            {detail.targetAudience ? <Meta icon={<Users className="h-3.5 w-3.5" />} text={detail.targetAudience} /> : null}
            {detail.responsible ? <Meta icon={<UserCog className="h-3.5 w-3.5" />} text={`Responsável: ${detail.responsible}`} /> : null}
            <Meta icon={<RefreshCw className="h-3.5 w-3.5" />} text={`Atualizado em ${formatDate(detail.updatedAt)}`} />
            <Meta icon={<Eye className="h-3.5 w-3.5" />} text={`${detail.viewCount.toLocaleString("pt-BR")} visualizações`} />
          </div>
        </div>
      </header>

      {/* Corpo — navegação por abas (aba padrão: Passo a passo) */}
      <ProcedureTabs
        videoCount={videoAttachments.length}
        materiaisCount={materialAttachments.length}
        passoAPasso={
          <>
            {detail.objective ? <Block title="Objetivo">{detail.objective}</Block> : null}
            {detail.whenToUse ? <Block title="Quando usar">{detail.whenToUse}</Block> : null}

            <section className="rounded-2xl border border-[#C6A24A]/30 bg-gradient-to-br from-[#1B1812] to-[#0E0D0A] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
              <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold text-[#F8F3E7]">
                <Gauge className="h-4 w-4 text-[#D6AA3A]" /> Passo a passo
              </h2>
              {detail.content ? (
                <div className="whitespace-pre-line text-sm leading-relaxed text-[#D7CDBA]">{detail.content}</div>
              ) : (
                <p className="text-sm text-[#B8AD9A]">Conteúdo não informado.</p>
              )}
            </section>

            {detail.commonMistakes ? <CommonErrors text={detail.commonMistakes} /> : null}

            {detail.tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Tag className="h-4 w-4 text-[#D6AA3A]" />
                {detail.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-[#D6AA3A]/35 bg-[#D6AA3A]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#F6D98B]">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        }
        videoaula={
          <>
            <ProcedureVideoLesson
              title={videoTitle}
              videoUrl={mainVideo?.url}
              description={mainVideo?.description ?? undefined}
              footer={videoManager}
            />
            {extraVideos.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#D6AA3A]">Vídeos complementares</p>
                {extraVideos.map((video) => (
                  <ProcedureVideoLesson
                    key={video.id}
                    showHeader={false}
                    title={video.fileName !== video.url ? video.fileName : undefined}
                    videoUrl={video.url}
                    description={video.description ?? undefined}
                  />
                ))}
              </div>
            ) : null}
          </>
        }
        materiais={<ProcedureAttachments slug={detail.slug} attachments={materialAttachments} canManage={canManage} />}
      />
    </article>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[#D6AA3A]">{icon}</span>
      {text}
    </span>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#C6A24A]/30 bg-gradient-to-br from-[#1B1812] to-[#0E0D0A] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
      <h2 className="mb-2 font-serif text-lg font-semibold text-[#F8F3E7]">{title}</h2>
      <div className="whitespace-pre-line text-sm leading-relaxed text-[#D7CDBA]">{children}</div>
    </section>
  );
}

function CommonErrors({ text }: { text: string }) {
  const errorsList = text
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <section className="rounded-2xl border border-red-500/35 bg-gradient-to-br from-[#2A0F0F] via-[#1A0B0B] to-[#0D0707] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-400/40 bg-red-500/15 text-red-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-serif text-xl font-semibold text-red-200">Erros comuns</h2>
          <p className="text-sm text-red-100/75">Pontos de atenção para evitar falhas no preenchimento ou execução.</p>
        </div>
      </div>

      {errorsList.length > 0 ? (
        <ul className="space-y-3">
          {errorsList.map((error, index) => (
            <li
              key={index}
              className="flex gap-3 rounded-xl border border-red-400/15 bg-black/25 px-4 py-3 text-sm leading-relaxed text-[#F8E7E7]"
            >
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-300" />
              <span>{error}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-red-400/15 bg-black/25 px-4 py-3 text-sm leading-relaxed text-[#F8E7E7]/70">
          Nenhum erro comum cadastrado para este procedimento.
        </p>
      )}
    </section>
  );
}

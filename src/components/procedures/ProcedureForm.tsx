"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PlayCircle, UploadCloud, Video, X } from "lucide-react";
import {
  PROCEDURE_CATEGORY_NAMES,
  PROCEDURE_LEVELS,
  PROCEDURE_STATUSES
} from "@/constants/procedure-categories";
import { getVideoProvider, videoProviderLabel } from "@/utils/video-embed";
import { PROCEDURE_VIDEO_MAX_MB, uploadProcedureVideo, validateProcedureVideoFile } from "@/utils/upload-procedure-video";
import type { ProcedureDetail } from "@/types/procedures";

type ProcedureFormProps = {
  open: boolean;
  onClose: () => void;
  /** Quando presente, o formulário edita; caso contrário, cria. */
  initial?: ProcedureDetail | null;
  /** Chamado após salvar com sucesso (ex.: redirecionar para o novo slug). */
  onSaved?: (slug: string) => void;
};

type FormState = {
  title: string;
  categoryName: string;
  summary: string;
  objective: string;
  whenToUse: string;
  content: string;
  commonMistakes: string;
  level: string;
  estimatedMinutes: string;
  targetAudience: string;
  responsible: string;
  tags: string;
  status: string;
  isFeatured: boolean;
  isOnboarding: boolean;
};

function emptyState(): FormState {
  return {
    title: "",
    categoryName: PROCEDURE_CATEGORY_NAMES[0],
    summary: "",
    objective: "",
    whenToUse: "",
    content: "",
    commonMistakes: "",
    level: PROCEDURE_LEVELS[0],
    estimatedMinutes: "",
    targetAudience: "",
    responsible: "",
    tags: "",
    status: PROCEDURE_STATUSES[0],
    isFeatured: false,
    isOnboarding: false
  };
}

function fromDetail(detail: ProcedureDetail): FormState {
  return {
    title: detail.title,
    categoryName: detail.categoryName,
    summary: detail.summary ?? "",
    objective: detail.objective ?? "",
    whenToUse: detail.whenToUse ?? "",
    content: detail.content ?? "",
    commonMistakes: detail.commonMistakes ?? "",
    level: detail.level,
    estimatedMinutes: detail.estimatedMinutes != null ? String(detail.estimatedMinutes) : "",
    targetAudience: detail.targetAudience ?? "",
    responsible: detail.responsible ?? "",
    tags: detail.tags.join(", "),
    status: detail.status,
    isFeatured: detail.isFeatured,
    isOnboarding: detail.isOnboarding
  };
}

export function ProcedureForm({ open, onClose, initial, onSaved }: ProcedureFormProps) {
  const router = useRouter();
  const isEditing = Boolean(initial);
  const [form, setForm] = useState<FormState>(emptyState);
  const [saving, setSaving] = useState(false);

  // Videoaula (anexo do tipo vídeo — reaproveita a API /attachments, sem campo no model).
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDescription, setVideoDescription] = useState("");
  const [existingVideoId, setExistingVideoId] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  // true quando a videoaula atual é um ARQUIVO enviado (não link): o link não é
  // pré-preenchido (URL é assinada/temporária), mas dá para substituir por outro
  // arquivo ou por um link novo.
  const [videoIsUploaded, setVideoIsUploaded] = useState(false);
  // Arquivo MP4 selecionado para enviar ao salvar (tem prioridade sobre o link).
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDragOver, setVideoDragOver] = useState(false);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const originalVideo = useRef({ url: "", title: "", description: "" });

  useEffect(() => {
    if (open) setForm(initial ? fromDetail(initial) : emptyState());
  }, [open, initial]);

  // Ao abrir em edição, carrega a videoaula atual (1º anexo de vídeo) para o formulário.
  useEffect(() => {
    if (!open) return;
    setVideoUrl("");
    setVideoTitle("");
    setVideoDescription("");
    setExistingVideoId(null);
    setVideoIsUploaded(false);
    setVideoFile(null);
    originalVideo.current = { url: "", title: "", description: "" };
    if (!initial) return;

    let ignore = false;
    setVideoLoading(true);
    fetch(`/api/procedures/${initial.id}/attachments`)
      .then((response) => response.json().catch(() => null))
      .then((data: { ok?: boolean; attachments?: Array<{ id: string; kind: string; url: string; fileName: string; description: string | null; isExternal: boolean }> } | null) => {
        if (ignore || !data?.ok) return;
        const video = (data.attachments ?? []).find((item) => item.kind === "video");
        if (!video) return;
        setExistingVideoId(video.id);
        // Vídeo enviado por arquivo: não pré-preenche o link (URL é temporária),
        // mas mantém o id para permitir substituição por arquivo/link.
        if (!video.isExternal) {
          setVideoIsUploaded(true);
          return;
        }
        const title = video.fileName && video.fileName !== video.url ? video.fileName : "";
        setVideoUrl(video.url);
        setVideoTitle(title);
        setVideoDescription(video.description ?? "");
        originalVideo.current = { url: video.url, title, description: video.description ?? "" };
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setVideoLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [open, initial]);

  if (!open) return null;

  const videoProvider = videoUrl.trim() ? getVideoProvider(videoUrl) : "unknown";
  const videoKnown = videoProvider !== "unknown";

  /**
   * Aplica a videoaula via API de anexos após salvar o procedimento.
   * Retorna true se houve um problema apenas com o vídeo (procedimento já foi salvo).
   */
  async function syncVideo(idOrSlug: string): Promise<boolean> {
    const orig = originalVideo.current;
    const hadVideo = Boolean(existingVideoId);
    const base = `/api/procedures/${encodeURIComponent(idOrSlug)}/attachments`;
    const deleteCurrent = async () => {
      if (hadVideo) await fetch(`${base}/${existingVideoId}`, { method: "DELETE" }).catch(() => {});
    };

    // 1) Arquivo selecionado → upload direto (tem prioridade sobre o link).
    if (videoFile) {
      const result = await uploadProcedureVideo(idOrSlug, videoFile, { title: videoTitle, description: videoDescription });
      if (!result.ok) {
        toast.error(result.message ?? "Não foi possível enviar o vídeo.");
        return true;
      }
      await deleteCurrent(); // substituição
      return false;
    }

    const newUrl = videoUrl.trim();

    // 2) Videoaula atual é um ARQUIVO enviado e nenhum link novo foi digitado → mantém.
    if (videoIsUploaded && !newUrl) return false;

    // 3) Link em branco (videoaula atual é link) → remove.
    if (!newUrl) {
      if (!hadVideo) return false;
      const res = await fetch(`${base}/${existingVideoId}`, { method: "DELETE" }).catch(() => null);
      return !res || !res.ok;
    }

    if (!/^https?:\/\//i.test(newUrl)) {
      toast.error("Videoaula: informe uma URL válida (http/https).");
      return true;
    }
    if (getVideoProvider(newUrl) === "unknown") {
      toast.error("Videoaula: link não reconhecido. Use YouTube, Google Drive, Vimeo ou .mp4.");
      return true;
    }

    const changed =
      newUrl !== orig.url || videoTitle.trim() !== orig.title || videoDescription.trim() !== orig.description;
    if (!changed) return false;

    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: newUrl,
        fileName: videoTitle.trim() || undefined,
        description: videoDescription.trim() || undefined
      })
    }).catch(() => null);
    if (!res || !res.ok) return true;

    await deleteCurrent(); // substituição
    return false;
  }

  function handleVideoFile(file: File | undefined | null) {
    if (!file) return;
    const invalid = validateProcedureVideoFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setVideoFile(file);
  }

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.summary.trim() || !form.content.trim()) {
      toast.error("Preencha título, resumo e conteúdo / passo a passo.");
      return;
    }
    setSaving(true);

    const payload = {
      title: form.title,
      categoryName: form.categoryName,
      summary: form.summary,
      objective: form.objective,
      whenToUse: form.whenToUse,
      content: form.content,
      commonMistakes: form.commonMistakes,
      level: form.level,
      estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : null,
      targetAudience: form.targetAudience,
      responsible: form.responsible,
      tags: form.tags,
      status: form.status,
      isFeatured: form.isFeatured,
      isOnboarding: form.isOnboarding
    };

    try {
      const url = isEditing ? `/api/procedures/${initial!.id}` : "/api/procedures";
      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; procedure?: { slug: string } } | null;

      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível salvar o procedimento.");
        return;
      }

      // Sincroniza a videoaula (criar/substituir/remover) com o procedimento salvo.
      const savedIdOrSlug = isEditing ? initial!.id : data.procedure?.slug ?? null;
      const videoFailed = savedIdOrSlug ? await syncVideo(savedIdOrSlug) : false;

      toast.success(isEditing ? "Procedimento atualizado com sucesso." : "Procedimento criado com sucesso.");
      if (videoFailed) toast.warning("O procedimento foi salvo, mas a videoaula não pôde ser atualizada.");
      onClose();
      router.refresh();
      if (data.procedure?.slug) onSaved?.(data.procedure.slug);
    } catch {
      toast.error("Falha de conexão ao salvar o procedimento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-[#C6A24A]/30 bg-gradient-to-br from-[#15130E] to-[#0E0D0A] shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between border-b border-[#C6A24A]/25 px-5 py-4">
          <h2 className="font-serif text-xl font-semibold text-[#F8F3E7]">{isEditing ? "Editar procedimento" : "Novo procedimento"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-[#B8AD9A] transition hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <Field label="Título *">
            <input className={inputClass} value={form.title} onChange={(e) => update("title", e.target.value)} required />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Categoria *">
              <select className={inputClass} value={form.categoryName} onChange={(e) => update("categoryName", e.target.value)}>
                {PROCEDURE_CATEGORY_NAMES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </Field>
            <Field label="Nível">
              <select className={inputClass} value={form.level} onChange={(e) => update("level", e.target.value)}>
                {PROCEDURE_LEVELS.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Resumo *">
            <textarea className={textareaClass} rows={2} value={form.summary} onChange={(e) => update("summary", e.target.value)} required />
          </Field>

          <Field label="Objetivo">
            <textarea className={textareaClass} rows={2} value={form.objective} onChange={(e) => update("objective", e.target.value)} />
          </Field>

          <Field label="Quando usar">
            <textarea className={textareaClass} rows={2} value={form.whenToUse} onChange={(e) => update("whenToUse", e.target.value)} />
          </Field>

          <Field label="Conteúdo / passo a passo *">
            <textarea className={textareaClass} rows={6} value={form.content} onChange={(e) => update("content", e.target.value)} required />
          </Field>

          <Field label="Erros comuns">
            <textarea className={textareaClass} rows={2} value={form.commonMistakes} onChange={(e) => update("commonMistakes", e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tempo estimado (min)">
              <input type="number" min={0} className={inputClass} value={form.estimatedMinutes} onChange={(e) => update("estimatedMinutes", e.target.value)} />
            </Field>
            <Field label="Status">
              <select className={inputClass} value={form.status} onChange={(e) => update("status", e.target.value)}>
                {PROCEDURE_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="Público indicado">
              <input className={inputClass} value={form.targetAudience} onChange={(e) => update("targetAudience", e.target.value)} placeholder="Ex.: Mecânicos e Eletricistas" />
            </Field>
            <Field label="Responsável">
              <input className={inputClass} value={form.responsible} onChange={(e) => update("responsible", e.target.value)} placeholder="Ex.: PCM" />
            </Field>
          </div>

          <Field label="Tags (separadas por vírgula)">
            <input className={inputClass} value={form.tags} onChange={(e) => update("tags", e.target.value)} placeholder="apontamento, sap, horas" />
          </Field>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm text-[#D7CDBA]">
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => update("isFeatured", e.target.checked)} className="h-4 w-4 accent-[#D6AA3A]" />
              Marcar como “Mais acessado / Destaque”
            </label>
            <label className="flex items-center gap-2 text-sm text-[#D7CDBA]">
              <input type="checkbox" checked={form.isOnboarding} onChange={(e) => update("isOnboarding", e.target.checked)} className="h-4 w-4 accent-[#D6AA3A]" />
              Marcar como “Funcionário Novo”
            </label>
          </div>

          {/* Videoaula do procedimento — salva como anexo de vídeo (arquivo ou link) */}
          <div className="space-y-3 rounded-xl border border-[#C6A24A]/25 bg-[#11100C]/50 p-4">
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-[#D6AA3A]" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#D6AA3A]">Videoaula do procedimento</span>
              {videoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8F846F]" /> : null}
            </div>

            {videoIsUploaded ? (
              <p className="rounded-lg border border-[#C6A24A]/20 bg-black/25 px-3 py-2 text-[12px] leading-relaxed text-[#D7CDBA]">
                A videoaula atual é um <strong>arquivo enviado</strong>. Envie outro arquivo ou cole um link para substituí-la.
              </p>
            ) : null}

            {/* Enviar arquivo (arrastar ou clicar) */}
            {videoFile ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[#D6AA3A]/40 bg-[#D6AA3A]/10 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-[12px] text-[#F8F3E7]">
                  <Video className="h-4 w-4 shrink-0 text-[#D6AA3A]" />
                  <span className="truncate" title={videoFile.name}>{videoFile.name}</span>
                  <span className="shrink-0 text-[#8F846F]">({(videoFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setVideoFile(null);
                    if (videoFileInputRef.current) videoFileInputRef.current.value = "";
                  }}
                  className="shrink-0 text-[#B8AD9A] transition hover:text-white"
                  aria-label="Remover arquivo selecionado"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setVideoDragOver(true);
                }}
                onDragLeave={() => setVideoDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setVideoDragOver(false);
                  handleVideoFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => videoFileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Enviar arquivo de vídeo"
                className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
                  videoDragOver ? "border-[#D6AA3A] bg-[#D6AA3A]/10" : "border-[#C6A24A]/30 bg-black/30 hover:border-[#D6AA3A]/55"
                }`}
              >
                <UploadCloud className="h-6 w-6 text-[#D6AA3A]" />
                <p className="text-[13px] font-semibold text-[#F8F3E7]">Arraste o vídeo aqui ou clique para enviar</p>
                <p className="text-[11px] text-[#8F846F]">Formato MP4, até {PROCEDURE_VIDEO_MAX_MB} MB. Hospedado no portal.</p>
              </div>
            )}
            <input ref={videoFileInputRef} type="file" accept="video/mp4" onChange={(e) => handleVideoFile(e.target.files?.[0])} className="hidden" />

            {/* Link externo — apenas quando nenhum arquivo foi selecionado */}
            {!videoFile ? (
              <>
                <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-[#8F846F]">
                  <span className="h-px flex-1 bg-[#C6A24A]/20" /> ou cole um link <span className="h-px flex-1 bg-[#C6A24A]/20" />
                </div>
                <input
                  className={inputClass}
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="Cole o link do YouTube, Google Drive ou vídeo interno..."
                />
                {videoUrl.trim() ? (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      videoKnown ? "border-[#D6AA3A]/30 bg-[#D6AA3A]/10 text-[#F6D98B]" : "border-danger/40 bg-danger/10 text-danger"
                    }`}
                  >
                    <Video className="h-3.5 w-3.5" /> Tipo de vídeo: {videoProviderLabel(videoProvider)}
                  </span>
                ) : null}
              </>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Título da videoaula">
                <input className={inputClass} value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="Ex.: Como apontar horas no SAP" />
              </Field>
              <Field label="Descrição curta">
                <input className={inputClass} value={videoDescription} onChange={(e) => setVideoDescription(e.target.value)} placeholder="Opcional" />
              </Field>
            </div>

            <p className="text-[11px] leading-relaxed text-[#8F846F]">
              Envie um arquivo MP4 ou cole um link (YouTube, Google Drive, Vimeo, <code>.mp4</code>). {videoIsUploaded ? null : "Deixe ambos em branco para remover a videoaula."}
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#C6A24A]/25 pt-4">
            <button type="button" onClick={onClose} className="h-10 rounded-lg border border-[#C6A24A]/30 px-4 text-sm font-semibold text-[#D7CDBA] transition hover:border-[#D6AA3A]/55 hover:text-white">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D6AA3A]/60 bg-[#D6AA3A]/15 px-4 text-sm font-bold text-[#F6D98B] transition hover:bg-[#D6AA3A]/25 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving && videoFile ? "Enviando vídeo…" : isEditing ? "Salvar alterações" : "Criar procedimento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-[#C6A24A]/30 bg-[#11100C] px-3 text-sm text-[#F8F3E7] outline-none transition placeholder:text-[#8F846F] focus:border-[#D6AA3A] focus:ring-2 focus:ring-[#D6AA3A]/20";
const textareaClass =
  "w-full rounded-lg border border-[#C6A24A]/30 bg-[#11100C] px-3 py-2 text-sm leading-relaxed text-[#F8F3E7] outline-none transition placeholder:text-[#8F846F] focus:border-[#D6AA3A] focus:ring-2 focus:ring-[#D6AA3A]/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#D6AA3A]">{label}</span>
      {children}
    </label>
  );
}

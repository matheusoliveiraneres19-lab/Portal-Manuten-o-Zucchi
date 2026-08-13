"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2, Plus, RefreshCw, Trash2, UploadCloud, Video, X } from "lucide-react";
import { getVideoProvider, videoProviderLabel } from "@/utils/video-embed";
import { PROCEDURE_VIDEO_MAX_MB, uploadProcedureVideo, validateProcedureVideoFile } from "@/utils/upload-procedure-video";

type ProcedureVideoManagerProps = {
  slug: string;
  /** Vídeo principal atual, se já cadastrado. `isExternal` = veio de link (não de upload). */
  current: { id: string; title: string; url: string; description: string | null; isExternal: boolean } | null;
};

const MAX_VIDEO_MB = PROCEDURE_VIDEO_MAX_MB;

/**
 * Gestão da videoaula (ADMIN/Gestão). Duas formas de cadastrar, ambas dentro do portal:
 *  - ENVIAR ARQUIVO (MP4): upload DIRETO ao Supabase Storage via URL assinada (contorna
 *    o limite de 4 MB da Vercel) e registra o anexo;
 *  - LINK externo (YouTube/Drive/Vimeo/.mp4): reaproveita a API de anexos.
 * Substituir = cria o novo e remove o anterior só depois (não perde o vídeo em caso de erro).
 */
export function ProcedureVideoManager({ slug, current }: ProcedureVideoManagerProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // Pré-preenche o link apenas quando o vídeo atual é um link (uploads usam URL temporária).
  const [url, setUrl] = useState(current?.isExternal ? current.url : "");
  const [title, setTitle] = useState(current?.title ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [savingLink, setSavingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const provider = url.trim() ? getVideoProvider(url) : "unknown";
  const isKnown = provider !== "unknown";
  const busy = savingLink || uploading || removing;

  function resetForm() {
    setUrl(current?.isExternal ? current.url : "");
    setTitle(current?.title ?? "");
    setDescription(current?.description ?? "");
  }

  /** Remove o vídeo anterior (best-effort) após o novo entrar — usado em substituição. */
  async function deleteCurrent() {
    if (!current) return;
    await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments/${current.id}`, { method: "DELETE" }).catch(() => {});
  }

  async function registerVideo(payload: Record<string, unknown>): Promise<boolean> {
    const response = await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    if (!response.ok || !data?.ok) {
      toast.error(data?.message ?? "Não foi possível salvar a videoaula.");
      return false;
    }
    return true;
  }

  // ---- Upload direto de arquivo MP4 ----
  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    const invalid = validateProcedureVideoFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    try {
      const result = await uploadProcedureVideo(slug, file, { title, description });
      if (!result.ok) {
        toast.error(result.message ?? "Não foi possível enviar o vídeo.");
        return;
      }
      // substituição: remove o vídeo anterior só depois do novo entrar
      await deleteCurrent();
      toast.success(current ? "Videoaula atualizada." : "Videoaula adicionada.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Falha de conexão durante o upload do vídeo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ---- Link externo ----
  async function handleSaveLink() {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("Informe uma URL válida (http/https) ou envie um arquivo.");
      return;
    }
    if (!isKnown) {
      toast.error("Link de vídeo não reconhecido. Use YouTube, Google Drive, Vimeo ou .mp4.");
      return;
    }
    setSavingLink(true);
    try {
      const ok = await registerVideo({
        url: trimmed,
        fileName: title.trim() || undefined,
        description: description.trim() || undefined
      });
      if (!ok) return;
      await deleteCurrent();
      toast.success(current ? "Videoaula atualizada." : "Videoaula adicionada.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Falha de conexão ao salvar a videoaula.");
    } finally {
      setSavingLink(false);
    }
  }

  async function handleRemove() {
    if (!current) return;
    if (!window.confirm("Remover a videoaula deste procedimento?")) return;
    setRemoving(true);
    try {
      const response = await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments/${current.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível remover a videoaula.");
        return;
      }
      toast.success("Videoaula removida.");
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setRemoving(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gold">Gestão da videoaula (ADMIN/Gestão)</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              resetForm();
              setOpen(true);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-3 text-[12px] font-bold text-gold-soft transition hover:bg-gold/25"
          >
            {current ? <RefreshCw className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {current ? "Substituir videoaula" : "Adicionar videoaula"}
          </button>
          {current ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-danger/40 px-3 text-[12px] font-bold text-danger transition hover:bg-danger/10 disabled:opacity-60"
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remover
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gold">Videoaula do procedimento</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-parchment-dim transition hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Enviar arquivo (drag & drop) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!busy) handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => !busy && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Enviar arquivo de vídeo"
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
          dragOver ? "border-gold bg-gold/10" : "border-gold/30 bg-black/30 hover:border-gold/55"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        {uploading ? (
          <>
            <Loader2 className="h-7 w-7 animate-spin text-gold" />
            <p className="text-sm font-semibold text-surface">Enviando vídeo…</p>
            <p className="text-[11px] text-neutralized">Não feche esta janela até concluir.</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-7 w-7 text-gold" />
            <p className="text-sm font-semibold text-surface">Arraste o vídeo aqui ou clique para enviar</p>
            <p className="text-[11px] text-neutralized">Formato MP4, até {MAX_VIDEO_MB} MB. O vídeo fica hospedado no portal.</p>
          </>
        )}
        <input ref={fileInputRef} type="file" accept="video/mp4" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" />
      </div>

      {/* Separador */}
      <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-neutralized">
        <span className="h-px flex-1 bg-gold/20" /> ou cole um link <span className="h-px flex-1 bg-gold/20" />
      </div>

      {/* Link externo */}
      <div className="space-y-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Cole o link do YouTube, Google Drive ou vídeo interno..."
          className={inputClass}
        />
        {url.trim() ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
              isKnown ? "border-gold/30 bg-gold/10 text-gold-soft" : "border-danger/40 bg-danger/10 text-danger"
            }`}
          >
            <Video className="h-3.5 w-3.5" /> Tipo detectado: {videoProviderLabel(provider)}
          </span>
        ) : null}
      </div>

      {/* Metadados (valem para arquivo e link) */}
      <div className="space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da videoaula (opcional)" className={inputClass} />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição curta (opcional)"
          className={inputClass}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-lg border border-gold/30 px-3 text-[12px] font-semibold text-parchment transition hover:border-gold/55 hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSaveLink}
          disabled={busy || !url.trim()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/60 bg-gold/15 px-3 text-[12px] font-bold text-gold-soft transition hover:bg-gold/25 disabled:opacity-50"
        >
          {savingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Salvar link
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "h-9 w-full rounded-lg border border-gold/30 bg-ink-card px-3 text-sm text-surface outline-none transition placeholder:text-neutralized focus:border-gold focus:ring-2 focus:ring-gold/20";

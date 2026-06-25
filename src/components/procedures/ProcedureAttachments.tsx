"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, ExternalLink, FileText, Link2, Loader2, Plus, Trash2, Upload, Video } from "lucide-react";
import type { ProcedureAttachmentItem } from "@/types/procedures";

type ProcedureAttachmentsProps = {
  slug: string;
  attachments: ProcedureAttachmentItem[];
  canManage: boolean;
};

export function ProcedureAttachments({ slug, attachments, canManage }: ProcedureAttachmentsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments`, { method: "POST", body: formData });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Falha no upload.");
        return;
      }
      toast.success("Material adicionado.");
      router.refresh();
    } catch {
      toast.error("Falha de conexão no upload.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAddLink() {
    if (!linkUrl.trim()) {
      toast.error("Informe a URL do link.");
      return;
    }
    setSavingLink(true);
    try {
      const response = await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkUrl, fileName: linkName || undefined })
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível adicionar o link.");
        return;
      }
      toast.success("Link adicionado.");
      setLinkUrl("");
      setLinkName("");
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setSavingLink(false);
    }
  }

  async function handleDelete(attId: string) {
    if (!window.confirm("Remover este material de apoio?")) return;
    try {
      const response = await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments/${attId}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível remover.");
        return;
      }
      toast.success("Material removido.");
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    }
  }

  const hasItems = attachments.length > 0;

  return (
    <section className="rounded-lg border border-gold/20 bg-black/40 p-5 backdrop-blur">
      <h2 className="mb-3 flex items-center gap-2 font-serif text-lg text-white">
        <FileText className="h-4 w-4 text-gold" /> Materiais de apoio
      </h2>

      {!hasItems ? (
        <p className="text-sm text-zinc-500">Nenhum material de apoio neste procedimento.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {attachments.map((item) => (
            <AttachmentCard key={item.id} item={item} canManage={canManage} onDelete={() => handleDelete(item.id)} />
          ))}
        </div>
      )}

      {canManage ? (
        <div className="mt-5 space-y-3 border-t border-gold/15 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gold/80">Adicionar material (ADMIN/Gestão)</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/45 bg-gold/15 px-3 text-[12px] font-bold text-gold transition hover:bg-gold/25 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Enviar arquivo (PDF/imagem, ≤ 4 MB)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.mp4,application/pdf,image/png,image/jpeg,image/webp,video/mp4"
              onChange={handleUpload}
              className="hidden"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Link de vídeo/documento (YouTube, Drive...)"
              className="h-9 flex-1 rounded-lg border border-gold/25 bg-black/50 px-3 text-sm text-champagne outline-none placeholder:text-zinc-500 focus:border-gold/60"
            />
            <input
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              placeholder="Título (opcional)"
              className="h-9 rounded-lg border border-gold/25 bg-black/50 px-3 text-sm text-champagne outline-none placeholder:text-zinc-500 focus:border-gold/60 sm:w-48"
            />
            <button
              type="button"
              onClick={handleAddLink}
              disabled={savingLink}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gold/45 px-3 text-[12px] font-bold text-gold transition hover:bg-gold/15 disabled:opacity-60"
            >
              {savingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar link
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AttachmentCard({
  item,
  canManage,
  onDelete
}: {
  item: ProcedureAttachmentItem;
  canManage: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-gold/15 bg-black/30">
      {canManage ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remover material"
          className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-md border border-danger/40 bg-black/60 text-danger transition hover:bg-danger/15"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {item.kind === "image" && item.url ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt={item.fileName} className="h-44 w-full object-cover" />
        </a>
      ) : item.kind === "video" && item.embedUrl ? (
        <div className="aspect-video w-full">
          <iframe
            src={item.embedUrl}
            title={item.fileName}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : item.kind === "video" && !item.isExternal && item.url ? (
        <video src={item.url} controls className="h-44 w-full bg-black object-contain" />
      ) : (
        <div className="flex h-24 items-center gap-3 px-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
            {item.kind === "pdf" ? <FileText className="h-5 w-5" /> : item.kind === "video" ? <Video className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
          </span>
          <span className="truncate text-sm font-semibold text-white" title={item.fileName}>
            {item.fileName}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-gold/10 px-3 py-2">
        <span className="truncate text-[12px] text-zinc-400" title={item.description ?? item.fileName}>
          {item.description || item.fileName}
        </span>
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-gold transition hover:text-champagne"
          >
            {item.isExternal ? <ExternalLink className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
            {item.isExternal ? "Abrir" : "Baixar"}
          </a>
        ) : null}
      </div>
    </div>
  );
}

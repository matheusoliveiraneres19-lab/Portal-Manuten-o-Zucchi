"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BTN_DANGER_ON_LIGHT,
  BTN_GOLD_ON_LIGHT,
  BTN_NEUTRAL_ON_LIGHT,
  BTN_SUCCESS_ON_LIGHT
} from "@/constants/interactive";
import { toast } from "sonner";
import { Archive, ArrowLeft, Check, CheckCircle2, Loader2, Pencil, Printer, Star } from "lucide-react";
import { ProcedureForm } from "@/components/procedures/ProcedureForm";
import type { ProcedureDetail } from "@/types/procedures";
import { formatDatePtBr } from "@/utils/date";

type ProcedureDetailActionsProps = {
  detail: ProcedureDetail;
  canManage: boolean;
  isFavorite: boolean;
  readConfirmedAt: string | null;
};

/**
 * Data da confirmação de leitura. Usa o formatador central, que declara o fuso do
 * portal — sem isso, servidor (UTC na Vercel) e navegador (UTC−3) discordam da data
 * entre 00:00 e 03:00 UTC e o React quebra a hidratação.
 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : formatDatePtBr(date);
}

/*
 * A barra de ações fica sobre a PÁGINA CLARA, acima do hero escuro do procedimento.
 * Ela usava tokens de superfície ESCURA (`text-parchment`, `text-gold-soft`,
 * `text-success-soft`) — claro sobre claro, entre 1,6:1 e 2,2:1, praticamente
 * invisível. Cada ação passa a usar a variante escura da sua própria cor, o que
 * também separa melhor os quatro papéis:
 *
 *   neutra (Voltar, Imprimir)   grafite quente + borda neutra
 *   positiva (Li e estou ciente) verde escuro sobre verde claro
 *   administrativa (Editar)      dourado escuro sobre dourado claro
 *   perigosa (Arquivar)          vermelho escuro sobre vermelho claro
 */
const NEUTRAL_BTN = `${BTN_NEUTRAL_ON_LIGHT} h-9 px-3 text-[13px]`;
const GOLD_BTN = `${BTN_GOLD_ON_LIGHT} h-9 px-3 text-[13px]`;
const SUCCESS_BTN = `${BTN_SUCCESS_ON_LIGHT} h-9 px-3 text-[13px]`;
const DANGER_BTN = `${BTN_DANGER_ON_LIGHT} h-9 px-3 text-[13px]`;

export function ProcedureDetailActions({ detail, canManage, isFavorite, readConfirmedAt }: ProcedureDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [favorite, setFavorite] = useState(isFavorite);
  const [favLoading, setFavLoading] = useState(false);
  const [readAt, setReadAt] = useState(readConfirmedAt);
  const [readLoading, setReadLoading] = useState(false);

  async function toggleFavorite() {
    setFavLoading(true);
    try {
      const response = await fetch(`/api/procedures/${encodeURIComponent(detail.slug)}/favorite`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; favorited?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível favoritar.");
        return;
      }
      setFavorite(Boolean(data.favorited));
      toast.success(data.favorited ? "Adicionado aos favoritos." : "Removido dos favoritos.");
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setFavLoading(false);
    }
  }

  async function confirmRead() {
    setReadLoading(true);
    try {
      const response = await fetch(`/api/procedures/${encodeURIComponent(detail.slug)}/read`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; confirmedAt?: string; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível registrar a leitura.");
        return;
      }
      setReadAt(data.confirmedAt ?? new Date().toISOString());
      toast.success("Leitura confirmada. Obrigado!");
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setReadLoading(false);
    }
  }

  async function archive() {
    if (!window.confirm("Arquivar este procedimento? Ele deixará de aparecer na lista pública.")) return;
    setArchiving(true);
    try {
      const response = await fetch(`/api/procedures/${detail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Arquivado" })
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível arquivar.");
        return;
      }
      toast.success("Procedimento arquivado.");
      router.push("/dashboard/procedimentos");
      router.refresh();
    } catch {
      toast.error("Falha de conexão ao arquivar.");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Link href="/dashboard/procedimentos" className={NEUTRAL_BTN}>
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      {/* Favorito — qualquer usuário */}
      <button
        type="button"
        onClick={toggleFavorite}
        disabled={favLoading}
        className={
          favorite
            ? `${GOLD_BTN} border-gold bg-gold/25`
            : NEUTRAL_BTN
        }
      >
        {favLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className={`h-4 w-4 ${favorite ? "fill-gold" : ""}`} />}
        {favorite ? "Favoritado" : "Favoritar"}
      </button>

      {/* Li e estou ciente — qualquer usuário */}
      {readAt ? (
        <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-success/50 bg-success/15 px-3 text-[13px] font-bold text-success-strong">
          <CheckCircle2 className="h-4 w-4" /> Lido em {formatDate(readAt)}
        </span>
      ) : (
        <button
          type="button"
          onClick={confirmRead}
          disabled={readLoading}
          className={SUCCESS_BTN}
        >
          {readLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Li e estou ciente
        </button>
      )}

      <button type="button" onClick={() => window.print()} className={NEUTRAL_BTN}>
        <Printer className="h-4 w-4" /> Imprimir
      </button>

      {canManage ? (
        <>
          <button type="button" onClick={() => setEditOpen(true)} className={GOLD_BTN}>
            <Pencil className="h-4 w-4" /> Editar
          </button>
          {detail.status !== "Arquivado" ? (
            <button
              type="button"
              onClick={archive}
              disabled={archiving}
              className={DANGER_BTN}
            >
              <Archive className="h-4 w-4" /> Arquivar
            </button>
          ) : null}
          <ProcedureForm open={editOpen} onClose={() => setEditOpen(false)} initial={detail} onSaved={(slug) => router.push(`/dashboard/procedimentos/${slug}`)} />
        </>
      ) : null}
    </div>
  );
}

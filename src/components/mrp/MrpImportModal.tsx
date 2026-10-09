"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Loader2, Lock, RefreshCw, Unlock, UploadCloud, Warehouse, X } from "lucide-react";
import { ModalShell, modalFieldInputClass, modalGhostButtonClass, modalPrimaryButtonClass } from "@/components/ui/ModalShell";
import { evaluateMrpLockFlags } from "@/lib/mrp/lock";
import { MRP_FILE_KINDS, MRP_FILE_KIND_LABELS, type MrpFileKind } from "@/lib/mrp/types";
import { fmtMrp } from "@/lib/mrp/format";
import type { MrpFilePreview } from "@/lib/mrp/import-plan";
import { mrpPost } from "@/components/mrp/mrp-api";

/**
 * "Atualizar planilhas" — o painel de envio do HTML sobre o fluxo do servidor:
 * upload assinado (Storage) → inspect (detecção + slots) → preview (trocar tipo
 * ou aba sem reenviar) → update-all (importação + análise, tudo ou nada).
 * Nenhuma regra de leitura roda no navegador: só exibe o que o servidor detectou.
 */
type Slot = { importId: string; fileName: string; kind: MrpFileKind; preview: MrpFilePreview };
type Slots = Record<MrpFileKind, Slot | null>;
const EMPTY: Slots = { base: null, est: null, cmp: null };
const MAX_FILES = 4;

const SLOT_TITLE: Record<MrpFileKind, string> = {
  base: "1 · Planilha do MRP",
  est: "2 · Planilha de estoque",
  cmp: "3 · Compras realizadas"
};
const SLOT_EMPTY: Record<MrpFileKind, string> = {
  base: "Sem envio, vale a Base MRP vigente — colunas: Material, Estoque mínimo, Estoque máximo",
  est: "Aguardando arquivo — colunas: Material, Depósito, Utilização livre",
  cmp: "Aguardando arquivo — colunas: Material, Requisição/Pedido, Data Recebimento"
};
const SLOT_ICON = { base: Database, est: Warehouse, cmp: FileSpreadsheet } as const;

type Props = { open: boolean; onClose: () => void; onUpdated: () => void; hasActiveBase: boolean; defaultDeposit: string };

export function MrpImportModal({ open, onClose, onUpdated, hasActiveBase, defaultDeposit }: Props) {
  const [slots, setSlots] = useState<Slots>(EMPTY);
  const [deposit, setDeposit] = useState(defaultDeposit);
  const [defaultArea, setDefaultArea] = useState("Mecânica");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const lock = evaluateMrpLockFlags(
    {
      base: slots.base && { requiredColumnsOk: slots.base.preview.diagnosis.requiredColumnsOk },
      est: slots.est && { requiredColumnsOk: slots.est.preview.diagnosis.requiredColumnsOk },
      cmp: slots.cmp && { requiredColumnsOk: slots.cmp.preview.diagnosis.requiredColumnsOk }
    },
    hasActiveBase
  );

  const refresh = useCallback(
    async (slot: Slot, patch: { kind?: MrpFileKind; sheet?: string; depositFilter?: string; defaultArea?: string }) => {
      const res = await mrpPost<{ preview: MrpFilePreview }>("/api/mrp/import/preview", { importId: slot.importId, ...patch });
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      return { ...slot, kind: res.data.preview.kind, preview: res.data.preview };
    },
    []
  );

  async function receive(list: FileList | File[]) {
    const files = Array.from(list).slice(0, MAX_FILES);
    if (!files.length) return;
    setError(null);
    setNotes(Array.from(list).length > MAX_FILES ? [`Só os ${MAX_FILES} primeiros arquivos foram considerados.`] : []);
    try {
      setBusy("Enviando arquivos…");
      const refs = [];
      for (const file of files) {
        const signed = await mrpPost<{ uploadUrl: string; path: string; bucket: string; contentType: string; apiKey: string }>(
          "/api/mrp/import/upload-url",
          { fileName: file.name }
        );
        if (!signed.ok) throw new Error(signed.error);
        const put = await fetch(signed.data.uploadUrl, {
          method: "PUT",
          headers: { "content-type": signed.data.contentType, apikey: signed.data.apiKey, "x-upsert": "false" },
          body: file
        });
        if (!put.ok) throw new Error(`Falha ao enviar ${file.name} para o armazenamento (HTTP ${put.status}).`);
        refs.push({ fileName: file.name, filePath: signed.data.path, bucket: signed.data.bucket, fileSize: file.size, mimeType: signed.data.contentType });
      }
      setBusy("Identificando planilhas…");
      const current = slotsRef.current;
      const currentSlots = Object.fromEntries(MRP_FILE_KINDS.filter((k) => current[k]).map((k) => [k, current[k]!.importId]));
      const res = await mrpPost<{ slots: Slots; rejected: { fileName: string; reason: string }[]; ignoredFiles: string[] }>(
        "/api/mrp/import/inspect",
        { files: refs, depositFilter: deposit, defaultArea, currentSlots }
      );
      if (!res.ok) throw new Error(res.error);
      setSlots((prev) => {
        const next = { ...prev };
        for (const k of MRP_FILE_KINDS) if (res.data.slots[k]) next[k] = res.data.slots[k];
        return next;
      });
      const extra = [...res.data.rejected.map((r) => `${r.fileName}: ${r.reason}`), ...res.data.ignoredFiles.map((f) => `${f}: ignorado (máximo de ${MAX_FILES} por envio)`)];
      if (extra.length) setNotes((n) => [...n, ...extra]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function changeKind(from: MrpFileKind, to: MrpFileKind) {
    if (from === to || !slots[from]) return;
    setBusy("Recalculando prévia…");
    // reatribuir(): troca os dois slots e refaz a prévia de quem mudou de tipo.
    const moving = slots[from]!;
    const swapped = slots[to];
    const updatedMoving = await refresh(moving, { kind: to });
    const updatedSwapped = swapped ? await refresh(swapped, { kind: from }) : null;
    if (updatedMoving) setSlots((s) => ({ ...s, [to]: updatedMoving, [from]: updatedSwapped }));
    setBusy(null);
  }

  async function changeSheet(kind: MrpFileKind, sheet: string) {
    const slot = slots[kind];
    if (!slot) return;
    setBusy("Lendo a aba…");
    const updated = await refresh(slot, { sheet });
    if (updated) setSlots((s) => ({ ...s, [kind]: updated }));
    setBusy(null);
  }

  // Depósito / área padrão: refaz a prévia do estoque / da base (debounce).
  useEffect(() => {
    const est = slotsRef.current.est;
    if (!est || est.preview.stock?.depositFilter === deposit.trim()) return;
    const t = setTimeout(async () => {
      const updated = await refresh(est, { depositFilter: deposit });
      if (updated) setSlots((s) => (s.est?.importId === est.importId ? { ...s, est: updated } : s));
    }, 500);
    return () => clearTimeout(t);
  }, [deposit, refresh]);

  useEffect(() => {
    const base = slotsRef.current.base;
    if (!base || base.preview.base?.defaultArea === defaultArea) return;
    void refresh(base, { defaultArea }).then((updated) => updated && setSlots((s) => (s.base?.importId === base.importId ? { ...s, base: updated } : s)));
  }, [defaultArea, refresh]);

  async function clear() {
    const ids = MRP_FILE_KINDS.map((k) => slots[k]?.importId).filter(Boolean);
    setSlots(EMPTY);
    setNotes([]);
    setError(null);
    if (ids.length) await mrpPost("/api/mrp/import/cancel", { importIds: ids });
  }

  async function updateAll() {
    if (!lock.ready) return;
    setError(null);
    setBusy("Importando planilhas e atualizando a análise…");
    const items = MRP_FILE_KINDS.filter((k) => slots[k]).map((k) => ({ importId: slots[k]!.importId, kind: k, sheet: slots[k]!.preview.sheet }));
    const res = await mrpPost<{ message: string }>("/api/mrp/update-all", { items, depositFilter: deposit, defaultArea });
    setBusy(null);
    if (!res.ok) {
      if (res.status === 422) {
        // Planilhas importadas (ficam no histórico, sem uso), análise NÃO aplicada:
        // a mensagem do servidor já diz que a análise anterior continua vigente.
        setError(res.error);
        setSlots(EMPTY);
        setNotes([]);
        return;
      }
      setError(`${res.error} A análise anterior continua vigente.`);
      return;
    }
    toast.success("Análise MRP atualizada com sucesso.");
    setSlots(EMPTY);
    setNotes([]);
    onUpdated();
  }

  return (
    <ModalShell open={open} onClose={busy ? () => undefined : onClose} title="Enviar planilhas do SAP" subtitle="Planilha do MRP (opcional), estoque e compras realizadas" size="xl">
      <div className="space-y-4">
        <p className="text-sm text-parchment-dim">
          Arraste as planilhas juntas: o portal identifica cada uma pelos cabeçalhos. <strong className="text-champagne">Atualizar tudo</strong> libera
          quando estoque e compras estiverem anexados e recalcula a análise de uma vez.
        </p>

        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy && e.dataTransfer.files.length) void receive(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
            dragging ? "border-gold bg-gold/10" : "border-gold/30 hover:border-gold/60"
          }`}
        >
          <UploadCloud className="h-7 w-7 text-gold" />
          <span className="text-sm font-semibold text-champagne">Clique ou arraste as planilhas aqui</span>
          <span className="text-xs text-parchment-dim">.xlsx · .xls · .csv — até {MAX_FILES} arquivos de uma vez</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            className="hidden"
            data-testid="mrp-file-input"
            onChange={(e) => {
              if (e.target.files?.length) void receive(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-parchment-dim">Considerar apenas o depósito</span>
            <input
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              className={`${modalFieldInputClass} !h-9 !w-24 font-mono font-bold`}
              aria-label="Depósito"
              data-testid="mrp-deposit"
            />
          </label>
          <span className="text-xs text-parchment-dim">em branco = todos os depósitos</span>
          {slots.base ? (
            <label className="flex items-center gap-2">
              <span className="text-parchment-dim">Área quando o nome da aba não indicar</span>
              <select value={defaultArea} onChange={(e) => setDefaultArea(e.target.value)} className={`${modalFieldInputClass} !h-9 !w-auto`}>
                <option value="Mecânica">Mecânica</option>
                <option value="Elétrica">Elétrica</option>
              </select>
            </label>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {MRP_FILE_KINDS.map((kind) => (
            <SlotCard key={kind} kind={kind} slot={slots[kind]} disabled={!!busy} onKind={(to) => changeKind(kind, to)} onSheet={(s) => changeSheet(kind, s)} />
          ))}
        </div>

        {notes.length ? (
          <ul className="space-y-1 rounded-md border border-gold/15 bg-black/25 px-3 py-2 text-xs text-parchment-dim">
            {notes.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p className="rounded-md border border-danger/45 bg-danger/10 px-3 py-2 text-sm text-danger-soft" role="alert">
            {error}
          </p>
        ) : null}

        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${lock.ready ? "border-success/40 bg-success/10" : "border-gold/20 bg-black/25"}`}>
          <p className="flex items-center gap-2 text-sm text-parchment" data-testid="mrp-lock-message">
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-gold" /> : lock.ready ? <Unlock className="h-4 w-4 text-success-soft" /> : <Lock className="h-4 w-4 text-gold" />}
            {busy ?? lock.message}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={clear} disabled={!!busy || lock.filled === 0} className={`${modalGhostButtonClass} disabled:opacity-50`}>
              <X className="h-4 w-4" /> Limpar anexos
            </button>
            <button type="button" onClick={updateAll} disabled={!!busy || !lock.ready} className={modalPrimaryButtonClass} data-testid="mrp-update-all">
              <RefreshCw className="h-4 w-4" /> Atualizar tudo
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function SlotCard(props: { kind: MrpFileKind; slot: Slot | null; disabled: boolean; onKind: (k: MrpFileKind) => void; onSheet: (s: string) => void }) {
  const { kind, slot } = props;
  const Icon = SLOT_ICON[kind];
  const p = slot?.preview;
  const ok = p?.diagnosis.requiredColumnsOk;
  const tone = !slot ? "border-gold/15" : ok ? "border-success/45" : "border-danger/50";
  return (
    <div className={`rounded-lg border bg-black/25 p-3 ${tone}`} data-testid={`mrp-slot-${kind}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-gold" />
        <span className="text-sm font-bold text-champagne">{SLOT_TITLE[kind]}</span>
        <span className="text-[11px] text-parchment-dim">{kind === "base" ? "(opcional)" : "(obrigatória)"}</span>
      </div>
      {!slot || !p ? (
        <p className="mt-2 text-xs text-parchment-dim">{SLOT_EMPTY[kind]}</p>
      ) : (
        <div className="mt-2 space-y-2 text-xs">
          <p className="flex items-start gap-1.5 text-parchment">
            {ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-soft" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-soft" />}
            <span className="min-w-0 break-words">
              <strong>{slot.fileName}</strong> · aba <strong>{p.sheet}</strong> · {fmtMrp(p.dataRows)} linhas · cabeçalho na linha {p.headerRow}
            </span>
          </p>
          {p.diagnosis.confidence === "LOW" ? (
            <p className="rounded border border-danger/45 bg-danger/10 px-2 py-1 font-semibold text-danger-soft">Confiança baixa: confira o tipo e a aba.</p>
          ) : null}
          {p.diagnosis.warnings.map((w) => (
            <p key={w} className="text-danger-soft">⚠ {w}</p>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Tipo da planilha"
              value={kind}
              disabled={props.disabled}
              onChange={(e) => props.onKind(e.target.value as MrpFileKind)}
              className={`${modalFieldInputClass} !h-8 text-xs`}
            >
              {MRP_FILE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {MRP_FILE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            {p.sheetNames.length > 1 ? (
              <select aria-label="Aba" value={p.sheet} disabled={props.disabled} onChange={(e) => props.onSheet(e.target.value)} className={`${modalFieldInputClass} !h-8 text-xs`}>
                {p.sheetNames.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {p.base ? (
            <p className="text-parchment-dim">
              {p.base.error ? <span className="text-danger-soft">{p.base.error}</span> : <>~{fmtMrp(p.base.estimatedMaterials)} materiais de {p.base.compatibleSheets.map((s) => `${s.name} (${s.area})`).join(", ")}</>}
              {p.base.ignoredSheets.length ? <> · ignoradas: {p.base.ignoredSheets.join(", ")}</> : null}
            </p>
          ) : null}
          {p.stock ? (
            <p className="text-parchment-dim">
              {p.stock.error ? <span className="text-danger-soft">{p.stock.error}</span> : <>{fmtMrp(p.stock.rowsAccepted)} materiais · {p.stock.depositInfo}</>}
              {p.stock.duplicateRows ? <> · {p.stock.duplicateRows} duplicadas (vale a 1ª)</> : null}
              {p.stock.otherDepositRows ? <> · {fmtMrp(p.stock.otherDepositRows)} de outros depósitos</> : null}
              {p.stock.warnings.map((w) => (
                <span key={w} className="mt-1 block text-warning-soft">⚠ {w}</span>
              ))}
            </p>
          ) : null}
          {p.purchases ? (
            <p className="text-parchment-dim">
              {p.purchases.error ? <span className="text-danger-soft">{p.purchases.error}</span> : <>{fmtMrp(p.purchases.rowsWithCode)} linhas com código</>}
              {Object.keys(p.purchases.optionalColumns).length ? <> · campos: {Object.values(p.purchases.optionalColumns).join(", ")}</> : null}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

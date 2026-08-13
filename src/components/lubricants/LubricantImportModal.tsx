"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  ModalShell,
  modalGhostButtonClass,
  modalPrimaryButtonClass
} from "@/components/ui/ModalShell";
import type { LubricantImportResult } from "@/types/lubricants";

type LubricantImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function LubricantImportModal({ open, onClose, onImported }: LubricantImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<LubricantImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setResult(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }, [open]);

  async function handleUpload() {
    if (!file) {
      toast.error("Selecione um arquivo .xlsx.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/lubricants/import", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "request failed");
      }
      setResult(data as LubricantImportResult);
      toast.success(`Importação concluída: ${data.createdMovements} movimentações`);
      onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar a planilha.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <ModalShell
      open={open}
      title="Importar planilha de lubrificação"
      subtitle='Aba "Data" — formato SAP/Fiori (.xlsx)'
      onClose={onClose}
    >
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gold/35 bg-black/25 px-4 py-8 text-center transition hover:border-gold/55">
        <FileSpreadsheet className="h-8 w-8 text-gold" />
        <span className="text-sm font-semibold text-champagne">
          {file ? file.name : "Clique para selecionar o arquivo .xlsx"}
        </span>
        <span className="text-[11px] text-zinc-500">
          Colunas: Material, Texto breve material, Tipo de movimento, Qtd. UM registro, Data de lançamento...
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>

      {result ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-gold/15 bg-black/25 p-3 text-xs">
          <Summary label="Total de linhas" value={result.totalRows} />
          <Summary label="Importadas" value={result.importedRows} />
          <Summary label="Lubrificantes criados" value={result.createdLubricants} />
          <Summary label="Movimentações criadas" value={result.createdMovements} />
          <Summary label="Ignoradas (duplicadas)" value={result.ignoredRows} />
          <Summary label="Com erro" value={result.errorRows} tone={result.errorRows > 0 ? "danger" : "default"} />
        </dl>
      ) : null}

      {result?.errors.length ? (
        <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-danger/30 bg-danger/10 p-2 text-[11px] text-rose-200">
          {result.errors.slice(0, 8).map((error, index) => (
            <p key={index}>
              Linha {error.linha}: {error.mensagem}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={modalGhostButtonClass}>
          {result ? "Fechar" : "Cancelar"}
        </button>
        <button type="button" onClick={handleUpload} disabled={uploading || !file} className={modalPrimaryButtonClass}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar
        </button>
      </div>
    </ModalShell>
  );
}

function Summary({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-zinc-400">{label}</dt>
      <dd className={`font-semibold ${tone === "danger" ? "text-danger" : "text-champagne"}`}>
        {value.toLocaleString("pt-BR")}
      </dd>
    </div>
  );
}

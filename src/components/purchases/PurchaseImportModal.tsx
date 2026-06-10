"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  PurchaseModalShell,
  purchaseGhostButtonClass,
  purchasePrimaryButtonClass
} from "@/components/purchases/PurchaseModalShell";
import { formatCurrency } from "@/utils/formatters";
import type { PurchaseImportResult } from "@/types/purchases";

type PurchaseImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function PurchaseImportModal({ open, onClose, onImported }: PurchaseImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<PurchaseImportResult | null>(null);
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
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/purchases/import", { method: "POST", body: formData });

      // A resposta pode não ser JSON (ex.: timeout do Netlify devolve HTML/erro genérico).
      const raw = await response.text();
      let data: (PurchaseImportResult & { success?: boolean; message?: string; details?: string }) | null = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (!response.ok || !data?.success) {
        const timedOut = response.status === 502 || response.status === 504 || !data;
        const friendly =
          data?.message ??
          (timedOut
            ? "A importação excedeu o tempo do servidor. Para planilhas grandes, use a importação via CLI (npm run import:purchases)."
            : "Não foi possível importar a planilha. Verifique a aba \"Data\" e as colunas, e tente novamente.");
        if (process.env.NODE_ENV === "development") {
          console.error("[import compras] falha:", response.status, data?.details ?? raw.slice(0, 300));
        }
        toast.error(friendly);
        return;
      }

      setResult(data as PurchaseImportResult);
      const meses = data.periodDetected?.months?.length ?? 0;
      toast.success(
        `Importação concluída: ${Number(data.importedRows).toLocaleString("pt-BR")} registros · ${meses} mês(es)`
      );
      onImported();
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[import compras] erro inesperado:", error);
      }
      toast.error(
        "Não foi possível importar a planilha. Verifique sua conexão e o arquivo, ou use a importação via CLI para planilhas grandes."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <PurchaseModalShell
      open={open}
      title="Importar planilha de compras"
      subtitle='Aba "Data" — formato SAP/Fiori (.xlsx)'
      onClose={onClose}
    >
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gold/35 bg-black/25 px-4 py-8 text-center transition hover:border-gold/55">
        <FileSpreadsheet className="h-8 w-8 text-gold" />
        <span className="text-sm font-semibold text-champagne">
          {file ? file.name : "Clique para selecionar o arquivo .xlsx"}
        </span>
        <span className="text-[11px] text-zinc-500">
          Colunas: Pedido de Compra, Requisição, Fornecedor, Material, Quantid, MIGO, MIRO, Grupo Merc, Grupo Comp...
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
          <Summary label="Criadas" value={result.createdRows} />
          <Summary label="Atualizadas" value={result.updatedRows} />
          <Summary label="Ignoradas (bloqueadas/dup.)" value={result.ignoredRows} />
          <Summary label="Com erro" value={result.errorRows} tone={result.errorRows > 0 ? "danger" : "default"} />
          <Summary label="Sem pedido" value={result.totalWithoutPurchaseOrder} />
          <Summary label="Com pedido" value={result.totalWithPurchaseOrder} />
          <Summary label="Com MIGO" value={result.totalMigo} />
          <Summary label="Com MIRO" value={result.totalMiro} />
          <Summary label="Atrasados em aberto" value={result.totalLateOpen} />
          <Summary label="Recebidos c/ atraso" value={result.totalLateReceived} />
          <Summary label="Regularizações Y04" value={result.totalRegularizations} />
          <Summary label="Compras normais Y01" value={result.totalNormalPurchases} />
          <Summary label="Serviços" value={result.totalServices} />
          <Summary label="Materiais" value={result.totalMaterials} />
          <div className="col-span-2 flex items-center justify-between gap-2 border-t border-gold/10 pt-2">
            <dt className="text-zinc-400">Valor total importado</dt>
            <dd className="font-semibold text-gold">{formatCurrency(result.totalValue)}</dd>
          </div>
          {result.periodDetected?.start ? (
            <div className="col-span-2 border-t border-gold/10 pt-2">
              <dt className="text-zinc-400">Período detectado na planilha</dt>
              <dd className="mt-0.5 font-semibold text-champagne">
                {formatIsoDate(result.periodDetected.start)} → {formatIsoDate(result.periodDetected.end)}
                <span className="ml-2 font-normal text-zinc-400">
                  ({result.periodDetected.months.length} mês(es): {result.periodDetected.months.join(", ")})
                </span>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {result?.warnings?.length ? (
        <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-[11px] text-amber-200">
          {result.warnings.map((warning, index) => (
            <p key={index}>• {warning}</p>
          ))}
        </div>
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
        <button type="button" onClick={onClose} className={purchaseGhostButtonClass}>
          {result ? "Fechar" : "Cancelar"}
        </button>
        <button type="button" onClick={handleUpload} disabled={uploading || !file} className={purchasePrimaryButtonClass}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Importando e validando dados..." : "Importar"}
        </button>
      </div>
    </PurchaseModalShell>
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

/** Formata "yyyy-mm-dd" para dd/mm/aaaa sem deslocamento de fuso. */
function formatIsoDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}/${month}/${year}` : value;
}

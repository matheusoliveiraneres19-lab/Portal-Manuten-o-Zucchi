"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileCheck2, Loader2 } from "lucide-react";
import {
  LubricantModalShell,
  fieldInputClass,
  fieldLabelClass,
  ghostButtonClass,
  primaryButtonClass
} from "@/components/lubricants/LubricantModalShell";

type LubricantTechnicalSheetModalProps = {
  open: boolean;
  code: string | null;
  description: string | null;
  currentUrl: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function LubricantTechnicalSheetModal({
  open,
  code,
  description,
  currentUrl,
  onClose,
  onSaved
}: LubricantTechnicalSheetModalProps) {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl(currentUrl ?? "");
    }
  }, [open, code, currentUrl]);

  async function handleSubmit() {
    if (!code) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/lubricants/technical-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, technicalSheetUrl: url })
      });
      if (!response.ok) {
        throw new Error("request failed");
      }
      toast.success(url.trim() ? "Ficha técnica informada" : "Ficha técnica removida");
      onSaved();
      onClose();
    } catch {
      toast.error("Não foi possível salvar a ficha técnica.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <LubricantModalShell
      open={open}
      title="Ficha técnica"
      subtitle={code ? `${code} — ${description ?? ""}` : undefined}
      onClose={onClose}
    >
      <label className="block">
        <span className={fieldLabelClass}>URL ou caminho do arquivo</span>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://... ou \\\\servidor\\fichas\\material.pdf"
          className={fieldInputClass}
        />
      </label>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        O upload de arquivos será habilitado na etapa de documentos. Por ora, informe a URL/caminho de rede. Deixe em
        branco para marcar a ficha como pendente.
      </p>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={ghostButtonClass}>
          Cancelar
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving} className={primaryButtonClass}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
          Salvar ficha técnica
        </button>
      </div>
    </LubricantModalShell>
  );
}

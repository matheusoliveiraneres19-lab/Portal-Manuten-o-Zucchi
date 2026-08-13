"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import {
  ModalShell,
  modalFieldInputClass,
  modalFieldLabelClass,
  modalGhostButtonClass,
  modalPrimaryButtonClass
} from "@/components/ui/ModalShell";

type LubricantMachineApplicationModalProps = {
  open: boolean;
  code: string | null;
  description: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function LubricantMachineApplicationModal({
  open,
  code,
  description,
  onClose,
  onSaved
}: LubricantMachineApplicationModalProps) {
  const [equipmentName, setEquipmentName] = useState("");
  const [equipmentCode, setEquipmentCode] = useState("");
  const [applicationPoint, setApplicationPoint] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEquipmentName("");
      setEquipmentCode("");
      setApplicationPoint("");
      setRecommendation("");
    }
  }, [open, code]);

  async function handleSubmit() {
    if (!code || !equipmentName.trim()) {
      toast.error("Informe o nome do equipamento/máquina.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/lubricants/machine-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, equipmentName, equipmentCode, applicationPoint, recommendation })
      });
      if (!response.ok) {
        throw new Error("request failed");
      }
      toast.success("Aplicação cadastrada");
      onSaved();
      onClose();
    } catch {
      toast.error("Não foi possível salvar a aplicação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open={open}
      title="Aplicações por máquina"
      subtitle={code ? `${code} — ${description ?? ""}` : undefined}
      onClose={onClose}
    >
      <div className="space-y-3">
        <label className="block">
          <span className={modalFieldLabelClass}>Equipamento / máquina *</span>
          <input
            value={equipmentName}
            onChange={(event) => setEquipmentName(event.target.value)}
            placeholder="Ex.: Compressor Atlas Copco"
            className={modalFieldInputClass}
          />
        </label>
        <label className="block">
          <span className={modalFieldLabelClass}>Código do equipamento</span>
          <input
            value={equipmentCode}
            onChange={(event) => setEquipmentCode(event.target.value)}
            placeholder="Ex.: EQ-COMP-01"
            className={modalFieldInputClass}
          />
        </label>
        <label className="block">
          <span className={modalFieldLabelClass}>Ponto de aplicação</span>
          <input
            value={applicationPoint}
            onChange={(event) => setApplicationPoint(event.target.value)}
            placeholder="Ex.: Sistema hidráulico"
            className={modalFieldInputClass}
          />
        </label>
        <label className="block">
          <span className={modalFieldLabelClass}>Recomendação</span>
          <textarea
            value={recommendation}
            onChange={(event) => setRecommendation(event.target.value)}
            placeholder="Ex.: Verificar nível semanalmente"
            rows={2}
            className={`${modalFieldInputClass} h-auto py-2`}
          />
        </label>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={modalGhostButtonClass}>
          Cancelar
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving} className={modalPrimaryButtonClass}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Adicionar aplicação
        </button>
      </div>
    </ModalShell>
  );
}

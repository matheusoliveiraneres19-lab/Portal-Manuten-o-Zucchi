"use client";

import { AlertTriangle } from "lucide-react";
import type { CriticalEquipmentFieldAvailability } from "@/types/critical-equipments";

type CriticalEquipmentFieldNoticeProps = {
  availability: CriticalEquipmentFieldAvailability;
};

/**
 * Aviso de campo ausente na base importada (TAREFA 15). Evita exibir indicador
 * sem explicação: quando a coluna do SAP não veio na planilha, o usuário sabe
 * exatamente o que reimportar — e o que o portal está usando enquanto isso.
 */
export function CriticalEquipmentFieldNotice({ availability }: CriticalEquipmentFieldNoticeProps) {
  const notices: Array<{ id: string; message: string; fallback: string }> = [];

  if (!availability.planningGroup) {
    notices.push({
      id: "planning-group",
      message:
        "Campo Grupo de Planejamento não encontrado na base importada. Reimporte a planilha de Ordens com essa coluna para habilitar o indicador.",
      fallback: "O dashboard por grupo de planejamento fica indisponível até a reimportação."
    });
  }

  if (!availability.planningActivityType) {
    notices.push({
      id: "activity-type",
      message:
        "Campo Tipo de Atividade não encontrado na base importada. Reimporte a planilha de Ordens com essa coluna para habilitar o indicador.",
      fallback:
        "Enquanto isso, o tipo de atividade é DERIVADO do plano programado (PL/PV), do tipo de manutenção e do texto da ordem — os indicadores continuam operacionais, mas com precisão menor que a do campo oficial."
    });
  }

  if (!notices.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-[12px] text-champagne"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <span>
            <strong className="font-semibold text-white">{notice.message}</strong>
            <span className="mt-0.5 block text-[11px] text-zinc-400">{notice.fallback}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

import type { CriticalityLabel } from "@/types/critical-equipments";

/** Paleta por criticidade alinhada ao tema premium (grafite, dourado, vinho). */
export const CRITICALITY_COLORS: Record<CriticalityLabel, string> = {
  Monitorado: "#2f6384", // azul/grafite
  Atenção: "#c49a45", // dourado/champagne
  Crítico: "#b51f32" // vermelho escuro
};

/** Classes Tailwind para badges em cards claros. */
export const CRITICALITY_BADGE_CLASS: Record<CriticalityLabel, string> = {
  Monitorado: "border-petroleum/40 bg-petroleum/10 text-petroleum",
  Atenção: "border-gold/45 bg-gold/15 text-[#7a5a16]",
  Crítico: "border-danger/40 bg-danger/10 text-danger"
};

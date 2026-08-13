import { SEMANTIC } from "@/constants/theme";
import type { CriticalityLabel } from "@/types/critical-equipments";

/**
 * Paleta por criticidade, derivada dos tokens semânticos do portal (theme.ts) —
 * a mesma escala usada em badges, KPIs e demais gráficos. Antes eram quatro hex
 * literais, o que fazia "Atenção" aqui e "atenção" em outra tela terem tons
 * diferentes.
 *
 * Valores em JS (e não classe Tailwind) porque alimentam props do Recharts.
 */
export const CRITICALITY_COLORS: Record<CriticalityLabel, string> = {
  Normal: SEMANTIC.success.DEFAULT,
  Monitorado: SEMANTIC.petroleum.DEFAULT,
  Atenção: SEMANTIC.warning.DEFAULT,
  Crítico: SEMANTIC.danger.DEFAULT
};

/**
 * Classes Tailwind para badges em cards CLAROS. O texto usa a variante `-strong`
 * (escurecida) para atingir contraste AA — o tom sólido reprovaria em texto
 * pequeno sobre a superfície bege.
 */
export const CRITICALITY_BADGE_CLASS: Record<CriticalityLabel, string> = {
  Normal: "border-success/40 bg-success/10 text-success-strong",
  Monitorado: "border-petroleum/40 bg-petroleum/10 text-petroleum-strong",
  Atenção: "border-warning/45 bg-warning/15 text-warning-strong",
  Crítico: "border-danger/40 bg-danger/10 text-danger-strong"
};

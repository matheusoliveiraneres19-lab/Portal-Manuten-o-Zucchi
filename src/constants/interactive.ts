/**
 * ESTADOS DE ELEMENTO INTERATIVO — classes compartilhadas.
 *
 * O portal tem DUAS superfícies: a página, que é CLARA (#fbf8f1 → #eee5d6), e os
 * painéis escuros (`bg-ink`, heros). Quase todo problema de contraste encontrado na
 * auditoria vem de um único engano: usar token de superfície escura
 * (`text-parchment`, `text-gold-soft`, `text-success-soft`, `text-champagne`) em
 * elemento que está sobre a página clara — aí o texto fica claro sobre claro e some.
 *
 * As constantes abaixo separam os dois mundos. `*_ON_LIGHT` usa os tons `deep`/
 * `strong` da paleta, que a própria `tailwind.config` já marca como os únicos
 * seguros sobre card claro. A identidade não muda: mesma família de dourado, verde,
 * vermelho e grafite quente.
 *
 * DISABLED sem `opacity` global. Opacidade no botão inteiro apaga texto, ícone,
 * borda e fundo junto — é o que deixava o rótulo ilegível. Aqui cada token é
 * declarado: fundo mais claro, borda discreta, texto cinza médio (ainda legível) e
 * `cursor-not-allowed`.
 */

/** Anel de foco padrão — visível nas duas superfícies. */
export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/**
 * Desabilitado legível: o usuário lê o rótulo e entende que não pode clicar.
 * Contraste do texto sobre o fundo: ~4,6:1 (neutralized-strong sobre bege claro).
 */
export const DISABLED_ON_LIGHT =
  "disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-black/[0.04] disabled:text-neutralized-strong disabled:shadow-none disabled:hover:bg-black/[0.04]";

/** Mesma ideia sobre painel escuro: fundo apagado, texto ainda legível. */
export const DISABLED_ON_DARK =
  "disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-parchment-dim disabled:shadow-none disabled:hover:bg-white/[0.04]";

const BASE = "inline-flex items-center justify-center gap-2 rounded-lg font-bold transition duration-200 ease-premium";

/* ------------------------------------------------------------------ */
/* Sobre a PÁGINA CLARA                                               */
/* ------------------------------------------------------------------ */

/** Ação neutra (Voltar, Imprimir, Limpar filtros). Grafite quente sobre bege. */
export const BTN_NEUTRAL_ON_LIGHT = `${BASE} h-10 border border-black/15 bg-white/70 px-4 text-sm text-neutralized-strong hover:border-gold/50 hover:bg-white hover:text-ink ${FOCUS_RING} ${DISABLED_ON_LIGHT}`;

/** Ação principal / administrativa (Importar, Editar). Dourado escuro, legível. */
export const BTN_GOLD_ON_LIGHT = `${BASE} h-10 border border-gold/60 bg-gold/20 px-4 text-sm text-gold-deep hover:border-gold hover:bg-gold/30 ${FOCUS_RING} ${DISABLED_ON_LIGHT}`;

/** Ação positiva (Li e estou ciente). Verde escuro sobre verde claro. */
export const BTN_SUCCESS_ON_LIGHT = `${BASE} h-10 border border-success/50 bg-success/15 px-4 text-sm text-success-strong hover:bg-success/25 ${FOCUS_RING} ${DISABLED_ON_LIGHT}`;

/** Ação perigosa (Arquivar, Excluir). Vermelho escuro sobre vermelho claro. */
export const BTN_DANGER_ON_LIGHT = `${BASE} h-10 border border-danger/50 bg-danger/10 px-4 text-sm text-danger-strong hover:bg-danger/20 ${FOCUS_RING} ${DISABLED_ON_LIGHT}`;

/* ------------------------------------------------------------------ */
/* Sobre PAINEL ESCURO                                                */
/* ------------------------------------------------------------------ */

export const BTN_NEUTRAL_ON_DARK = `${BASE} h-10 border border-gold/25 px-4 text-sm text-parchment hover:border-gold/55 hover:text-white ${FOCUS_RING} ${DISABLED_ON_DARK}`;
export const BTN_GOLD_ON_DARK = `${BASE} h-10 border border-gold/55 bg-gold/15 px-4 text-sm text-gold hover:bg-gold/25 ${FOCUS_RING} ${DISABLED_ON_DARK}`;

/* ------------------------------------------------------------------ */
/* Texto                                                              */
/* ------------------------------------------------------------------ */

/**
 * Hierarquia de texto sobre a PÁGINA CLARA.
 *
 * `MUTED` é secundário, não "quase invisível": `neutralized` (#8F846F) sobre bege
 * dá ~4,6:1. Os cinzas `zinc-300/400` que estavam espalhados davam ~1,8:1 e eram o
 * que sumia na tela.
 */
export const TEXT_ON_LIGHT = {
  primary: "text-ink",
  secondary: "text-neutralized-strong",
  muted: "text-neutralized"
} as const;

/** Hierarquia sobre painel escuro. */
export const TEXT_ON_DARK = {
  primary: "text-white",
  secondary: "text-parchment",
  muted: "text-parchment-dim"
} as const;

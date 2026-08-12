/**
 * DESIGN SYSTEM DO PORTAL — fonte única de verdade das cores.
 *
 * Por que este arquivo existe
 * ---------------------------
 * Antes dele havia 552 hex literais e 90 valores distintos espalhados por
 * `src/components`, incluindo TRÊS dourados convivendo (`#c49a45` do Tailwind,
 * `#D6AA3A` com 107 usos e `#C6A24A` com 44). O resultado era um portal que parecia
 * feito por módulos diferentes. Aqui centralizamos os valores; o Tailwind
 * (`tailwind.config.ts`) expõe os mesmos tokens como classes utilitárias.
 *
 * Como usar
 * ---------
 * - Em JSX, prefira as classes do Tailwind (`text-gold`, `border-success/30`).
 * - Importe daqui SOMENTE quando a cor precisa ser um valor JS: props do Recharts
 *   (`stroke`, `fill`), `<Cell fill>`, gradientes SVG e estilos inline.
 * - NUNCA escreva um hex novo em componente. Se falta um tom, adicione-o aqui.
 *
 * Relação com `pc-factory-colors.ts`
 * ----------------------------------
 * Aquele arquivo continua sendo a fonte única das cores de STATUS do PC-Factory
 * (mapeia texto livre vindo da planilha/banco para cor). Este arquivo trata das
 * cores GERAIS do portal e das SÉRIES de gráfico compartilhadas entre módulos.
 * `CHART_SERIES` abaixo usa deliberadamente as mesmas hues do PC-Factory para que
 * "Manutenção Elétrica" seja o mesmo roxo em qualquer tela do portal.
 *
 * Mudança puramente visual: nada aqui interfere em cálculo, importação, filtro,
 * regra de negócio ou banco.
 */

/* ------------------------------------------------------------------ */
/* Identidade Zucchi / Luxury Stones                                  */
/* ------------------------------------------------------------------ */

/**
 * Escala de dourado. `DEFAULT` é o tom vivo que já predominava no módulo de
 * Procedimentos (107 usos) — mais luminoso que o antigo `#c49a45`, mantendo a
 * mesma hue da marca.
 */
export const GOLD = {
  /** Dourado principal — ícones, títulos de seção, bordas de destaque. */
  DEFAULT: "#D6AA3A",
  /** Champagne claro — texto sobre superfície escura, realce em hero. */
  soft: "#F6D98B",
  /** Dourado profundo — texto dourado sobre superfície CLARA (contraste AA). */
  deep: "#7B551F",
  /** Linha/borda dourada discreta sobre superfície escura. */
  line: "rgba(214, 170, 58, 0.22)"
} as const;

/** Pretos e grafites da identidade (fundo de hero, sidebar, tabelas densas). */
export const INK = {
  /** Preto Zucchi — fundo mais profundo. */
  DEFAULT: "#0B0A08",
  /** Grafite — superfície escura elevada (hero, header de tabela). */
  raised: "#15130E",
  /** Grafite claro — linha divisória sobre fundo escuro. */
  line: "rgba(255, 255, 255, 0.08)"
} as const;

/** Superfícies claras (mármore/champagne) dos cards `.panel`. */
export const SURFACE = {
  /** Fundo de página claro. */
  DEFAULT: "#F8F3E7",
  /** Card elevado sobre o fundo. */
  raised: "#FFFFFF",
  /** Borda de card sobre superfície clara. */
  line: "rgba(62, 49, 29, 0.14)"
} as const;

/* ------------------------------------------------------------------ */
/* Cores semânticas — estado, criticidade, natureza técnica           */
/* ------------------------------------------------------------------ */

/**
 * Cada token tem três variantes com papéis distintos:
 *  - `DEFAULT`: preenchimento sólido / ícone sobre superfície clara;
 *  - `on_light`: TEXTO sobre superfície clara (escurecido para atingir AA 4.5:1);
 *  - `on_dark`: TEXTO sobre superfície escura (clareado para atingir AA 4.5:1).
 *
 * Usar `DEFAULT` como cor de texto pequeno sobre `.panel` reprova em contraste —
 * é justamente o problema que existia com `text-zinc-500` sobre bege (≈4.0:1).
 */
export const SEMANTIC = {
  /** Positivo / disponível / produção / concluído. */
  success: { DEFAULT: "#2E8B57", on_light: "#1F6B41", on_dark: "#5FD0A0" },
  /** Atenção / aguardando / pendência recente. */
  warning: { DEFAULT: "#D6A935", on_light: "#8A6A20", on_dark: "#F5D48A" },
  /** Criticidade / corretiva / atrasado / bloqueado. */
  danger: { DEFAULT: "#B01E35", on_light: "#8E1728", on_dark: "#F19AA8" },
  /** Indicador técnico neutro / preventiva / planejado. */
  petroleum: { DEFAULT: "#15506A", on_light: "#123F53", on_dark: "#7FB8D4" },
  /** Elétrica / automação. */
  electric: { DEFAULT: "#7C3AED", on_light: "#5B21B6", on_dark: "#C4A6FD" },
  /** Neutro / sem classificação / desativado. */
  neutral: { DEFAULT: "#8F846F", on_light: "#5C5344", on_dark: "#C9C0AE" }
} as const;

export type SemanticTone = keyof typeof SEMANTIC;

/* ------------------------------------------------------------------ */
/* Séries de gráfico — categoria → cor, igual em todo o portal         */
/* ------------------------------------------------------------------ */

/**
 * Cor por CATEGORIA de negócio nos gráficos. Fixa a leitura: verde é sempre
 * produção, vermelho é sempre corretiva/mecânica, roxo é sempre elétrica — em
 * qualquer módulo. Substitui a cor automática do Recharts e o hardcode espalhado.
 *
 * Alinhado ao padrão já consolidado em `pc-factory-colors.ts`.
 */
export const CHART_SERIES = {
  /** Produção / disponível / OK. */
  producao: "#16A34A",
  /** Manutenção mecânica. */
  mecanica: "#DC2626",
  /** Manutenção elétrica. */
  eletrica: "#7C3AED",
  /** Automação (roxo claro, subtipo de elétrica). */
  automacao: "#A78BFA",
  /** Aguardando manutenção. */
  aguardando: "#F59E0B",
  /** Manutenção planejada / preventiva. */
  preventiva: "#0EA5E9",
  /** Corretiva (mesma hue de mecânica — corretiva é predominantemente mecânica). */
  corretiva: "#DC2626",
  /** Criticidade máxima (PC-Factory crítico, fora do planejado). */
  critico: "#7F1D1D",
  /** Compras / suprimentos. */
  compras: "#D6AA3A",
  /** Ordens de Serviço / indicador técnico. */
  ordens: "#15506A",
  /** Sem classificação. */
  outros: "#9CA3AF"
} as const;

export type ChartSeriesKey = keyof typeof CHART_SERIES;

/**
 * Paleta ordenada para séries SEM categoria semântica (ex.: "top 5 fornecedores").
 * Use na ordem; nunca deixe o Recharts escolher. As hues são suficientemente
 * distintas para leitura em monitor grande e em impressão em tons de cinza.
 */
export const CHART_SEQUENCE = [
  "#15506A",
  "#D6AA3A",
  "#2E8B57",
  "#7C3AED",
  "#B01E35",
  "#0EA5E9",
  "#D97706",
  "#8F846F"
] as const;

/* ------------------------------------------------------------------ */
/* Eixos, grades e tooltips dos gráficos                              */
/* ------------------------------------------------------------------ */

/** Cores de chrome dos gráficos, por tipo de superfície onde o gráfico vive. */
export const CHART_CHROME = {
  /** Gráfico dentro de card claro (`.panel`) — o caso padrão do portal. */
  onLight: {
    grid: "#E4DACA",
    axis: "#7A6E58",
    label: GOLD.deep
  },
  /** Gráfico dentro de card escuro. */
  onDark: {
    grid: "rgba(255,255,255,0.10)",
    axis: "#A79C86",
    label: GOLD.soft
  }
} as const;

/** Tooltip premium escuro, usado sobre qualquer superfície. */
export const TOOLTIP = {
  background: "rgba(11, 10, 8, 0.96)",
  border: GOLD.line,
  title: GOLD.soft,
  text: "#F1EADA"
} as const;

/**
 * Resolve a cor de uma série a partir de um rótulo livre de categoria
 * ("Manutenção Elétrica", "Corretiva", "Produção"...). Tolera acento e caixa.
 * Categoria desconhecida → cinza neutro, nunca cor aleatória.
 */
export function resolveChartSeriesColor(label: string): string {
  if (!label) {
    return CHART_SERIES.outros;
  }

  const key = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (key in CHART_SERIES) {
    return CHART_SERIES[key as ChartSeriesKey];
  }

  if (key.includes("eletric")) return CHART_SERIES.eletrica;
  if (key.includes("automac")) return CHART_SERIES.automacao;
  if (key.includes("mecanic")) return CHART_SERIES.mecanica;
  if (key.includes("aguardando")) return CHART_SERIES.aguardando;
  if (key.includes("preventiv") || key.includes("planejad")) return CHART_SERIES.preventiva;
  if (key.includes("corretiv")) return CHART_SERIES.corretiva;
  if (key.includes("producao")) return CHART_SERIES.producao;
  if (key.includes("compra")) return CHART_SERIES.compras;
  if (key.includes("critic")) return CHART_SERIES.critico;
  if (key.includes("ordem") || key.includes("ordens")) return CHART_SERIES.ordens;

  return CHART_SERIES.outros;
}

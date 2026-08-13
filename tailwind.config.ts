import type { Config } from "tailwindcss";

/**
 * Tokens visuais do portal, espelhando `src/constants/theme.ts` (a fonte única em
 * JS, usada por Recharts e estilos inline). Se alterar um valor aqui, altere lá.
 *
 * Convenção das variantes semânticas:
 *   `bg-success`          → preenchimento sólido / ícone
 *   `text-success-strong` → TEXTO sobre superfície CLARA (contraste AA)
 *   `text-success-soft`   → TEXTO sobre superfície ESCURA (contraste AA)
 *
 * Usar o tom sólido como cor de texto pequeno sobre `.panel` reprova em contraste;
 * é para isso que existem `-strong` e `-soft`.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // --- Identidade Zucchi ------------------------------------------
        /**
         * Escala de ELEVAÇÃO do escuro (ver INK em theme.ts): página → base do
         * card → topo do gradiente → superfície elevada → hover. Os degraus
         * intermediários é que separam card de fundo numa tela escura.
         */
        ink: {
          DEFAULT: "#0B0A08",
          card: "#0E0D0A",
          "card-top": "#1B1812",
          raised: "#15130E",
          hover: "#1F1B13"
        },
        graphite: "#141617",
        /**
         * Texto quente sobre superfície escura. Substitui os cinzas puros
         * (zinc/gray), que brigam com a identidade de mármore.
         *   text-surface        → título
         *   text-parchment      → corpo
         *   text-parchment-dim  → secundário
         */
        parchment: {
          DEFAULT: "#D7CDBA",
          dim: "#B8AD9A"
        },
        /**
         * Dourado da marca. `DEFAULT` foi unificado no tom vivo que já
         * predominava no módulo de Procedimentos (era #c49a45, mais apagado).
         * `deep` é o único seguro para texto dourado sobre card claro.
         */
        gold: {
          DEFAULT: "#D6AA3A",
          soft: "#F6D98B",
          deep: "#7B551F"
        },
        champagne: "#efe3c2",
        marble: "#f5f0e8",
        surface: {
          DEFAULT: "#F8F3E7",
          raised: "#FFFFFF"
        },

        // --- Semânticas ------------------------------------------------
        petroleum: {
          DEFAULT: "#15506A",
          strong: "#123F53",
          soft: "#7FB8D4"
        },
        danger: {
          DEFAULT: "#B01E35",
          strong: "#8E1728",
          soft: "#F19AA8"
        },
        success: {
          DEFAULT: "#2E8B57",
          strong: "#1F6B41",
          soft: "#5FD0A0"
        },
        warning: {
          DEFAULT: "#D6A935",
          strong: "#8A6A20",
          soft: "#F5D48A"
        },
        /** Elétrica / automação. */
        electric: {
          DEFAULT: "#7C3AED",
          strong: "#5B21B6",
          soft: "#C4A6FD"
        },
        neutralized: {
          DEFAULT: "#8F846F",
          strong: "#5C5344",
          soft: "#C9C0AE"
        }
      },
      boxShadow: {
        /** Sombra herdada — mantida para não alterar telas que já a usam. */
        premium: "0 18px 50px rgba(8, 10, 11, 0.16)",
        /**
         * Card em repouso. Três camadas (contato + difusa + luz interna
         * superior) em vez de uma única sombra chapada — é o que dá a
         * sensação de profundidade real.
         */
        card:
          "0 1px 2px rgba(40, 31, 18, 0.06), 0 8px 24px -6px rgba(40, 31, 18, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.65)",
        /** Card sob o cursor — sombra mais alta e espalhada. */
        "card-hover":
          "0 2px 4px rgba(40, 31, 18, 0.08), 0 18px 40px -10px rgba(40, 31, 18, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.75)",
        /** Card sobre superfície escura. */
        "card-dark":
          "0 1px 2px rgba(0, 0, 0, 0.40), 0 12px 32px -8px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)"
      },
      borderRadius: {
        /** Raio padrão dos cards do portal (mais moderno que o rounded-lg de 8px). */
        card: "0.875rem"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-playfair)", "Georgia", "serif"]
      },
      transitionTimingFunction: {
        /** Curva padrão do portal — saída suave, sem "elástico". */
        premium: "cubic-bezier(0.22, 0.61, 0.36, 1)"
      },
      keyframes: {
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        /** Entrada discreta de card/seção. Respeita prefers-reduced-motion (globals.css). */
        "fade-in-up": "fade-in-up 0.34s cubic-bezier(0.22, 0.61, 0.36, 1) both"
      }
    }
  },
  plugins: []
};

export default config;

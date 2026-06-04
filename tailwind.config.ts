import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080a0b",
        graphite: "#141617",
        gold: "#c49a45",
        champagne: "#efe3c2",
        marble: "#f5f0e8",
        petroleum: "#0f4d68",
        danger: "#a6192e"
      },
      boxShadow: {
        premium: "0 18px 50px rgba(8, 10, 11, 0.16)"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-playfair)", "Georgia", "serif"]
      }
    }
  },
  plugins: []
};

export default config;

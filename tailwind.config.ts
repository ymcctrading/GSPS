import type { Config } from "tailwindcss";

/**
 * GSPS design system — "textbook stealth terminal".
 * Palette sourced from the System Handover doc: obsidian canvas, crimson bearish,
 * emerald bullish, gold/amber active-nav accent. Inter typeface.
 *
 * NOTE (accessibility, see Suggestion S-7 in the review log): bull/bear state is
 * ALSO conveyed with direction glyphs/labels in components — never color alone.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#0D0F12", // ultra-dark obsidian
          raised: "#131722", // slate panel
        },
        bear: {
          bg: "#2A1418",
          DEFAULT: "#EF4444",
          soft: "#FF6B7A",
        },
        bull: {
          bg: "#11241D",
          DEFAULT: "#10B981",
          soft: "#52E3A4",
        },
        accent: {
          DEFAULT: "#F5A623", // active navigation nodes / highlights
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

/**
 * GSPS design tokens (single source of truth, mirrored in tailwind.config.ts).
 * Kept as plain data so non-Tailwind consumers (canvas chart renderer, emails,
 * status badges) share the exact same palette.
 */
export const palette = {
  canvas: "#0D0F12",
  canvasRaised: "#131722",
  bear: { bg: "#2A1418", base: "#EF4444", soft: "#FF6B7A" },
  bull: { bg: "#11241D", base: "#10B981", soft: "#52E3A4" },
  accent: "#F5A623",
} as const;

export const typography = {
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
} as const;

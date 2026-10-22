/**
 * The guide colours in app/globals.css hold Chuck's art direction (2026-10-22):
 * Bull green, Bear red, readable as text in light and dark mode, and nothing
 * green near Mrs. Bear.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function block(selector: ":root" | ".dark"): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe("guide colour tokens", () => {
  for (const mode of [":root", ".dark"] as const) {
    const t = block(mode);
    it(`${mode}: each guide's name reads at AA on the surface, the background and its own tint`, () => {
      for (const g of ["guide-bull", "guide-bear"]) {
        expect(t[g], `${mode} --${g}`).toBeDefined();
        for (const bg of [t.surface, t.background, t[`${g}-soft`]]) {
          expect(contrast(t[g], bg)).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it(`${mode}: Bull is green and every Bear colour is red, never green, teal or olive`, () => {
      const bull = hue(t["guide-bull"]);
      expect(bull).toBeGreaterThan(90);
      expect(bull).toBeLessThan(170);
      for (const g of ["guide-bear", "guide-bear-soft"]) {
        const h = hue(t[g]);
        expect(h < 20 || h > 340, `${mode} --${g} hue ${h}`).toBe(true);
      }
    });
  }
});

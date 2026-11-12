/** The gap between top-bar items, in px; must match `gap-1` on the top bar in nav.tsx. */
const TOP_BAR_GAP = 4;

/**
 * How many top-bar items fit beside a "More" button, given each item's width.
 * All of them when they fit on their own (no "More" needed); otherwise as many
 * as fit in `available` once the button and its gap are set aside. Kept apart
 * from the component so it is tested on its own.
 */
export function fitCount(widths: number[], available: number, moreWidth: number, gap = TOP_BAR_GAP): number {
  const total = widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, widths.length - 1);
  if (total <= available) return widths.length;
  let used = moreWidth;
  let n = 0;
  for (const w of widths) {
    if (used + gap + w > available) break;
    used += gap + w;
    n++;
  }
  return n;
}

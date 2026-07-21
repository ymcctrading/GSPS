/**
 * Scanner result badge.
 *  - PRISTINE (score 8-9): gold / diamond — "practically flawless".
 *  - VELOCITY (score 7 + high velocity): flame — "missed one check but moving fast".
 *
 * Keeps the Robinhood-clean surface while signalling the backend waterfall tier.
 */

export type SetupTier = "PRISTINE" | "VELOCITY";

export interface ScannerResultBadgeProps {
  score: number; // 0-9
  setupTier: SetupTier;
}

export function ScannerResultBadge({ score, setupTier }: ScannerResultBadgeProps) {
  const isPristine = setupTier === "PRISTINE";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs font-bold ${
        isPristine
          ? "border-[#E3B341] bg-[#3A2E12] text-[#E3B341]" // gold
          : "border-[#FF7B29] bg-[#3A1F12] text-[#FF7B29]" // flame
      }`}
      title={
        isPristine
          ? "Pristine setup — 8/9 or 9/9 checks passed"
          : "High-velocity fallback — score 7 with elevated RVOL / ATR expansion"
      }
    >
      <span aria-hidden>{isPristine ? "◆" : "🔥"}</span>
      {score}/9
    </span>
  );
}

export default ScannerResultBadge;

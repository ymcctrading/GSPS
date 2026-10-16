"use client";

/**
 * Gann's pyramiding suggestion for one open position (lib/gann/pyramid.ts):
 * shown only when the position has earned an add, or, while it hasn't, the
 * time-to-hold warning when its first day closed against it. Advisory;
 * nothing is placed.
 */

import { useEffect, useState } from "react";

export function PyramidHint({ symbol }: { symbol: string }) {
  const [note, setNote] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/positions/pyramid?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { add?: { note: string } | null; holdWarning?: string | null } | null) => {
        if (cancelled) return;
        setNote(body?.add?.note ?? null);
        setWarning(body?.holdWarning ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbol]);
  if (!note) {
    // Time to hold: a first close against the trade is a warning, not an exit.
    return warning ? (
      <p className="mt-1 text-xs text-bear" role="note">
        {warning}
      </p>
    ) : null;
  }
  return (
    <p className="mt-1 text-xs text-bull" role="note">
      <span className="font-medium">Adding to a winner: </span>
      {note} Each add is smaller than the last, and you never add to a losing trade.
    </p>
  );
}

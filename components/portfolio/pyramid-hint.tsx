"use client";

/**
 * Gann's pyramiding suggestion for one open position (lib/gann/pyramid.ts):
 * shown only when the position has earned an add. Advisory; nothing is placed.
 */

import { useEffect, useState } from "react";

export function PyramidHint({ symbol }: { symbol: string }) {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/positions/pyramid?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { add?: { note: string } | null } | null) => {
        if (!cancelled) setNote(body?.add?.note ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbol]);
  if (!note) return null;
  return (
    <p className="mt-1 text-xs text-bull" role="note">
      <span className="font-medium">Adding to a winner: </span>
      {note} Each add is smaller than the last, and you never add to a losing trade.
    </p>
  );
}

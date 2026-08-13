"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ExitsState } from "./types";

/**
 * What the staged-exit manager did on the last poll.
 * -----------------------------------------------------------------------------
 * `lib/trade/exit-manager.ts` moves trailing stops, attaches a fresh
 * position's tranches, and closes plans — all without a user in the loop, on
 * a ten-second timer. That is exactly the kind of change that needs a visible
 * trace: a stop that moved is a change to the user's risk, and one that
 * couldn't be moved (a broker rejection mid-attach, a symbol left with only
 * partial protection) is something to act on while there's still time. Before
 * this component the manager's `exits` payload was computed on every request
 * and read by nothing — the work happened and the app said nothing about it.
 *
 * Errors persist until the next poll clears them; notes are the latest pass's
 * only, since they describe *changes*, not standing state — a note that
 * "TP1 was reached" stops being news the moment it's read.
 */
export function ExitActivity({ exits }: { exits: ExitsState | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!exits) return null;

  const hasNotes = exits.notes.length > 0;
  if (!hasNotes && !exits.error) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3 text-xs",
        exits.error ? "border-warn/40 bg-warn-soft text-warn" : "border-border bg-surface text-muted",
      )}
    >
      {exits.error && <p className="font-medium">{exits.error}</p>}

      {hasNotes && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              "min-h-6 w-fit cursor-pointer text-left font-medium underline-offset-2 hover:underline",
              !exits.error && "text-foreground",
            )}
          >
            {exits.notes.length === 1
              ? "1 protocol exit update this pass"
              : `${exits.notes.length} protocol exit updates this pass`}
            {expanded ? " (hide)" : " (show)"}
          </button>
          {expanded && (
            <ul className="flex flex-col gap-1 pl-3">
              {exits.notes.map((note, i) => (
                <li key={i} className="list-disc marker:text-muted/60">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

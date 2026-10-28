"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SELL_SETUP_HELP, SELL_SETUP_LESSON_HREF } from "@/lib/education/sellSetupHelp";

/**
 * "How do I trade a sell setup?" for Novice members (owner, 2026-10-28), on
 * every surface that shows a Novice a sell setup. Closed by default, like the
 * pattern explainer, so it doesn't compete with the plan.
 *
 * `novice` is the viewer's tier, resolved on the server: pass it where the
 * page already knows it; left out, the note asks `/api/account/novice` and
 * shows nothing until it answers (never a client-side tier guess). A Novice
 * answer is kept for the browser session; any other answer or a failure is
 * not, so a transient error or a promotion is read again on the next surface.
 */

let noviceRead: Promise<boolean> | null = null;

function readNovice(): Promise<boolean> {
  noviceRead ??= Promise.resolve()
    .then(() => fetch("/api/account/novice"))
    .then((res) => (res?.ok ? res.json() : null))
    .then((body: { novice?: unknown } | null) => body?.novice === true)
    .catch(() => false)
    .then((novice) => {
      if (!novice) noviceRead = null;
      return novice;
    });
  return noviceRead;
}

/** For tests: forget the cached tier read. */
export function resetSellSetupHelpCache() {
  noviceRead = null;
}

export function SellSetupHelp({ novice, className }: { novice?: boolean; className?: string }) {
  const [resolved, setResolved] = useState<boolean | null>(novice ?? null);

  useEffect(() => {
    if (novice !== undefined) return;
    let live = true;
    void readNovice().then((n) => {
      if (live) setResolved(n);
    });
    return () => {
      live = false;
    };
  }, [novice]);

  const show = novice ?? resolved;
  if (!show) return null;

  const h = SELL_SETUP_HELP;
  return (
    <details
      className={`group rounded-lg border border-border bg-background ${className ?? ""}`}
      data-testid="sell-setup-help"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium">
        <span>{h.title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 border-t border-border px-3 py-3 text-sm text-foreground">
        <p>{h.analogy}</p>
        <p>{h.shortSale}</p>
        <ul className="list-disc pl-5">
          {h.needs.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="font-medium">{h.alternativesIntro}</p>
        <ul className="list-disc pl-5">
          {h.alternatives.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>{h.practice}</p>
        <Link href={SELL_SETUP_LESSON_HREF} className="self-start font-medium text-accent hover:underline">
          {h.lessonLink}
        </Link>
      </div>
    </details>
  );
}

"use client";

/**
 * GSPS — a contextual tip from Mrs. Bull or Mr. Bear.
 *
 * Drop one beside a control and the mascot explains it, once, the first time
 * that user meets it. Dismissing is permanent and per-user.
 *
 * ## The one-at-a-time rule is enforced here, not by convention
 *
 * Every mounted tip registers with a module-level claim, and only the first
 * one to claim renders; the rest stay silent until it is dismissed. Leaving
 * this to "just don't put two tips on a page" would hold right up until two
 * components that each independently carry a tip appear on the same screen —
 * which is precisely the case nobody notices in review, and precisely how a
 * helpful mascot becomes a swarm.
 *
 * The claim is module state rather than context because tips are mounted by
 * unrelated components in different subtrees; a provider would have to wrap
 * the whole app to see them all, and every page would pay for it.
 */

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Mascot, MASCOTS } from "@/components/onboarding/mascots";
import { shouldShowTip, TIPS_DEFAULT, type TipState } from "@/lib/onboarding/status";
import { tipById } from "@/lib/onboarding/tips";
import { cn } from "@/lib/utils";

/** The single on-screen slot. Held by whichever tip mounted first. */
let claimant: string | null = null;
const claimListeners = new Set<() => void>();

function notifyClaim() {
  for (const listen of claimListeners) listen();
}

/**
 * Claim the slot for this tip, releasing it on unmount.
 *
 * Returns whether this tip holds it. A tip that does not hold the slot renders
 * nothing at all rather than rendering hidden — an invisible tip still in the
 * accessibility tree is a tip a screen-reader user hears and cannot find.
 */
function useSlot(tipId: string, wanted: boolean): boolean {
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    // The listener both re-renders *and* attempts the claim. Splitting those —
    // subscribing with a bare `force` and claiming in a separate effect — looks
    // equivalent and is not: when the holder releases the slot, a waiting tip's
    // claim effect does not re-run, because none of its dependencies changed.
    // The slot would then sit empty with a tip queued behind it forever.
    const onChange = () => {
      if (wanted && claimant === null) claimant = tipId;
      force();
    };
    claimListeners.add(onChange);
    onChange();

    return () => {
      claimListeners.delete(onChange);
      if (claimant === tipId) {
        claimant = null;
        // Snapshot-iterated, and the claim above happens synchronously, so the
        // first listener to run takes the slot and the rest simply re-render.
        notifyClaim();
      }
    };
  }, [tipId, wanted]);

  return wanted && claimant === tipId;
}

export function MascotTip({ id, className }: { id: string; className?: string }) {
  const tip = tipById(id);
  const [state, setState] = React.useState<TipState | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding/tips")
      .then((res) => (res.ok ? (res.json() as Promise<TipState>) : TIPS_DEFAULT))
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        // A tip that cannot confirm its own state stays hidden. Unlike the
        // server default, the client failure mode is "say nothing": the user
        // is mid-task and a hint is never worth a wrong guess here.
        if (!cancelled) setState({ ...TIPS_DEFAULT, enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const wanted = Boolean(tip) && state !== null && !dismissed && shouldShowTip(state, id);
  const holdsSlot = useSlot(id, wanted);

  function dismiss() {
    // Hidden immediately, recorded in the background. A dismissal that waits
    // for a round trip feels broken, and the local flag already prevents it
    // reappearing in this session if the write fails.
    setDismissed(true);
    void fetch("/api/onboarding/tips", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismiss: id }),
    }).catch(() => {});
  }

  if (!tip || !holdsSlot) return null;

  return (
    <aside
      // `status`, not `alert`: this is helpful context, and an assertive live
      // region would cut across whatever a screen-reader user is doing.
      role="status"
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-xl border px-3 py-2.5",
        tip.mascot === "bull" ? "border-bull/30 bg-bull-soft" : "border-bear/30 bg-bear-soft",
        className,
      )}
    >
      <Mascot name={tip.mascot} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {tip.title}
          <span className="ml-2 text-xs font-normal text-muted">{MASCOTS[tip.mascot].label}</span>
        </p>
        <p className="mt-0.5 text-sm leading-relaxed">{tip.body}</p>
        {tip.href && tip.hrefLabel && (
          <Link href={tip.href} className="mt-1 inline-block text-sm font-medium text-accent hover:underline">
            {tip.hrefLabel} →
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={`Dismiss this tip about ${tip.title}`}
        className="-mr-1 -mt-1 flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground cursor-pointer"
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}

/** Test seam: drop the slot claim between renders. Not used in the app. */
export function __resetTipSlot() {
  claimant = null;
  notifyClaim();
}

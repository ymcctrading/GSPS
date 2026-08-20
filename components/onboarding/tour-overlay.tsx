"use client";

/**
 * GSPS — the spotlight tour overlay.
 *
 * Dims the app, cuts a hole around the thing being described, and puts a card
 * of plain-English copy next to it. It runs on top of the live app rather than
 * on a mock of it, so a reader learns where the Portfolio tab actually is on
 * their own screen at their own size.
 *
 * ## Why the anchors can go missing, and why that is fine
 *
 * A step names a `data-tour` value; the element carrying it may not be on the
 * page. That is not an error case to guard against, it is the normal state of
 * affairs: the nav renders eight destinations in the top bar but only seven in
 * the phone tab bar, so the Glossary step has no anchor on a phone in portrait.
 * A tour that threw, skipped the step, or pointed at nothing rather than
 * admitting it would be worse than one that simply centres the card and reads
 * the copy out. So `resolveAnchor` returning null is a supported outcome and
 * the layout has a branch for it.
 *
 * The same function also handles the *duplicate* case, which is the flip side:
 * the top bar and the tab bar both carry `nav-portfolio`, and exactly one of
 * them is visible at any breakpoint. Picking the first match in DOM order would
 * spotlight an element with a zero-size rect on phones, so the first match with
 * real dimensions wins instead.
 *
 * ## Scrolling
 *
 * The page is deliberately NOT frozen. Steps point at real page sections, which
 * are usually below the fold when the step opens, so the tour has to move the
 * page rather than hold it still. The anchor is scrolled to centre once, then
 * re-measured as the page settles.
 *
 * The subtle trap here, and the reason `resolveAnchor` is written the way it
 * is: an off-screen anchor must still resolve. Treating "outside the viewport"
 * as "not found" means the element never resolves, so the scroll that would
 * bring it into view never fires, so it never resolves — and every page-
 * anchored step quietly degrades to a centred bubble that points at nothing.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SnapshotFigure } from "@/components/onboarding/snapshot-figure";
import { Mascot, MascotPair, MASCOTS } from "@/components/onboarding/mascots";
import { speakerFor } from "@/lib/onboarding/mascot";
import { TOUR_STEPS } from "@/lib/onboarding/tour";
import type { TourOutcome } from "@/lib/onboarding/status";

/** Padding around the spotlit element, so the ring does not sit on its edge. */
const HOLE_PAD = 6;
/**
 * How long to keep re-measuring after a step opens.
 *
 * Covers a navigation, a fetch and a smooth scroll settling. Bounded rather
 * than indefinite: a permanent 4-per-second interval behind a tour someone
 * left open is a battery cost for no benefit, and by this point either the
 * anchor exists or the centred fallback is the right answer anyway.
 */
const ANCHOR_SETTLE_MS = 6000;
/** Card width, and the room a card needs before it will sit on a given side. */
const CARD_W = 360;
const CARD_SPACE = 300;
const GAP = 12;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Find the on-screen element for a `data-tour` value.
 *
 * Returns null when the attribute is absent, when every element carrying it has
 * no layout (`display: none` at this breakpoint), or when the one that does is
 * outside the viewport. All three mean the same thing to the caller — there is
 * nothing to point at — so they collapse to one return value rather than three
 * flavours of failure the layout would have to tell apart.
 */
function resolveAnchor(anchor: string | undefined): { el: HTMLElement; rect: Rect } | null {
  if (!anchor || typeof document === "undefined") return null;
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(anchor)}"]`);
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    // Zero-size is the only disqualifier. Being outside the viewport is NOT:
    // an in-page section is normally below the fold when its step opens, and
    // rejecting it here would mean never resolving it, therefore never
    // scrolling to it — which silently reduced every page-anchored step to a
    // centred bubble. Off-screen means "scroll to me", not "ignore me".
    if (r.width === 0 || r.height === 0) continue;
    return { el, rect: { top: r.top, left: r.left, width: r.width, height: r.height } };
  }
  return null;
}

/** Where the copy card sits relative to the hole, given the room available. */
type Placement =
  | { kind: "center" }
  | { kind: "below"; top: number; left: number }
  | { kind: "above"; bottom: number; left: number };

function placeCard(rect: Rect | null): Placement {
  if (rect === null || typeof window === "undefined") return { kind: "center" };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_W, vw - GAP * 2);
  // Centre the card on the anchor, then pull it back inside the viewport. A
  // nav item at the far right of a wide header would otherwise hang off-screen.
  const left = Math.max(GAP, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - GAP));

  if (vh - (rect.top + rect.height) >= CARD_SPACE) {
    return { kind: "below", top: rect.top + rect.height + HOLE_PAD + GAP, left };
  }
  if (rect.top >= CARD_SPACE) {
    return { kind: "above", bottom: vh - rect.top + HOLE_PAD + GAP, left };
  }
  return { kind: "center" };
}

export function TourOverlay({ open, onClose }: { open: boolean; onClose: (outcome: TourOutcome) => void }) {
  const [index, setIndex] = React.useState(0);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const step = TOUR_STEPS[index];
  const isFirst = index === 0;
  const isLast = index === TOUR_STEPS.length - 1;

  // Restart from the top each time the tour is opened. Resuming where someone
  // left off sounds friendlier than it is: the person most likely to reopen
  // this is one who wants the part they have forgotten, and dropping them into
  // step 9 of 15 with no context is not that.
  //
  // Adjusted during render off a remembered previous value rather than in an
  // effect. An effect would paint the stale step for one frame before
  // correcting it, which on a reopen is visibly wrong — the reader sees the
  // step they left on, then a jump.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(0);
  }

  // Take the reader to the page the step is about, so the screen behind the
  // bubble is the screen being described rather than whichever one they
  // happened to be on. `startsWith` because a step naming /ticker should not
  // bounce a reader already looking at /ticker/AAPL back to a bare route.
  React.useEffect(() => {
    if (!open || !step?.route) return;
    if (!pathname.startsWith(step.route)) router.push(step.route);
  }, [open, step?.route, pathname, router]);

  // Find and follow the anchor.
  //
  // Three things make this harder than reading a rect once. The page may still
  // be navigating. The element may not exist yet — Guided runs a live scan,
  // Settings fetches its caps, the Dashboard may still be building today's
  // list — so the anchor can arrive seconds after the step does. And an in-page
  // section is usually below the fold, unlike a nav tab.
  //
  // So: watch the DOM until the anchor appears, scroll it into view once, then
  // keep re-measuring as the page settles. If it never arrives, `rect` stays
  // null and the bubble centres itself, which is a supported outcome rather
  // than a failure — see the note at the top of this file.
  React.useEffect(() => {
    if (!open) return;
    const anchor = step?.anchor;
    let scrolled = false;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const found = resolveAnchor(anchor);
      setRect(found?.rect ?? null);
      if (found && !scrolled) {
        scrolled = true;
        // `center` rather than `nearest`: a section flush against the sticky
        // header is technically in view and reads as cut off.
        //
        // Feature-tested rather than called outright. Scrolling is a nicety —
        // the ring and the bubble are already positioned correctly without it —
        // so an environment that lacks it (jsdom under test, and any renderer
        // that stubs layout) should quietly go without rather than throw and
        // take the whole tour down.
        // The element `resolveAnchor` measured, not a fresh querySelector —
        // those disagree when a section is rendered twice across breakpoints,
        // and scrolling the hidden copy moves nothing.
        if (typeof found.el.scrollIntoView === "function") {
          found.el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    };

    measure();
    // Re-measures while content loads in and while the smooth scroll runs.
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    // MutationObserver misses a rect that moved without the DOM changing —
    // the tail of a smooth scroll, a font swapping in, an image settling.
    const settle = window.setInterval(measure, 250);
    const stopSettling = window.setTimeout(() => window.clearInterval(settle), ANCHOR_SETTLE_MS);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      window.clearInterval(settle);
      window.clearTimeout(stopSettling);
    };
  }, [open, step?.anchor, pathname]);

  const next = React.useCallback(() => {
    setIndex((i) => {
      if (i >= TOUR_STEPS.length - 1) {
        onClose("completed");
        return i;
      }
      return i + 1;
    });
  }, [onClose]);

  const back = React.useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Escape leaves the tour. It is recorded as skipped rather than completed,
  // which changes nothing the user sees — both stop it auto-launching again —
  // but keeps "read to the end" and "escaped on step 2" distinguishable for
  // anyone later asking whether this thing is working.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose("skipped");
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, next, back]);

  // Move focus onto the card on every step so a screen reader announces the new
  // heading and body rather than leaving the user on a button labelled "Next"
  // whose surrounding text has silently changed.
  React.useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, index]);

  if (!mounted || !open || !step) return null;

  const speaker = speakerFor(step.id);
  const placement = placeCard(rect);
  const width = Math.min(CARD_W, (typeof window === "undefined" ? CARD_W : window.innerWidth) - GAP * 2);

  const cardStyle: React.CSSProperties =
    placement.kind === "below"
      ? { position: "fixed", top: placement.top, left: placement.left, width }
      : placement.kind === "above"
        ? { position: "fixed", bottom: placement.bottom, left: placement.left, width }
        : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width };

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Introduction to GSPS"
    >
      {/*
        One element does both jobs: the enormous spread on the box-shadow dims
        everything outside its own bounds, which is the dimming layer, while its
        own bounds are the hole. Two stacked divs with a computed cut-out would
        need four rectangles kept in sync on every resize; this needs none.
      */}
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl ring-2 ring-accent transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style={{
            top: rect.top - HOLE_PAD,
            left: rect.left - HOLE_PAD,
            width: rect.width + HOLE_PAD * 2,
            height: rect.height + HOLE_PAD * 2,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.72)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-[rgba(2,6,23,0.72)]" />
      )}

      <div
        ref={cardRef}
        tabIndex={-1}
        style={cardStyle}
        className="flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl outline-none"
      >
        {/*
          The character sits in the header and the copy below is what they are
          saying — the whole card is the speech bubble. Putting the mascot
          outside it, the way Clippy stood beside his balloon, costs horizontal
          room the card does not have on a 360px phone, and the first thing to
          get clipped would be the character.
        */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <Mascot name={speaker} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {MASCOTS[speaker].label} · Step {index + 1} of {TOUR_STEPS.length}
            </p>
            <h2 className="text-base font-semibold text-balance">{step.title}</h2>
          </div>
          <button
            onClick={() => onClose("skipped")}
            aria-label="Leave the tour"
            className="-mr-1 flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-background hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {step.body.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-relaxed">
              {paragraph}
            </p>
          ))}
          {/* The one step whose subject is the characters themselves. */}
          {step.id === "meet-the-guides" && <MascotPair />}
          <SnapshotFigure figure={step.figure} />
          {step.href && step.hrefLabel && (
            <Link
              href={step.href}
              className="w-fit text-sm font-medium text-accent hover:underline"
            >
              {step.hrefLabel} →
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => onClose("skipped")} className="text-muted">
            Skip
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={back} disabled={isFirst}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button size="sm" onClick={next}>
              {isLast ? "Done" : "Next"}
              {!isLast && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

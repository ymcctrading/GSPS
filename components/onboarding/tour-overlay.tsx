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
import { ArrowLeft, ArrowRight, X, Zap, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SnapshotFigure } from "@/components/onboarding/snapshot-figure";
import { TOUR_STEPS, TOUR_STEPS_SHORT, type TourMode } from "@/lib/onboarding/tour";
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
/**
 * Height of the sticky app header, plus a little breathing room. An anchor
 * whose top sits above this line is hidden behind the header even though its
 * `getBoundingClientRect().top` reads as a small positive number — "in the
 * viewport" and "visible" are not the same thing here.
 */
const HEADER_OFFSET = 64;
/** Card width. */
const CARD_W = 360;
/**
 * Floor on the card's height when neither side has much room, so it never
 * gets squeezed to something unreadable. The card scrolls internally past
 * this, so a tight fit costs a scrollbar, not legibility.
 */
const MIN_CARD_HEIGHT = 160;
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
  | { kind: "below"; top: number; left: number; maxHeight: number }
  | { kind: "above"; bottom: number; left: number; maxHeight: number };

/**
 * Always beside the hole, never on top of it — the card goes wherever there is
 * more room (below or above) rather than requiring a fixed amount before it
 * will use a side at all. A phone viewport rarely has 300px clear on either
 * side of a dashboard section anchored near the top of the page, so requiring
 * that meant the card fell back to dead centre — directly over the element it
 * was describing. Sizing the card's max-height to whatever room the chosen
 * side actually has (floored at `MIN_CARD_HEIGHT`, scrollable past that) keeps
 * it legible without ever needing to cover the hole to do it.
 *
 * `center` survives only for a step with no resolved anchor at all — there is
 * no hole to protect in that case, so centring is the right answer, not a
 * fallback for a hole the card could not find room around.
 */
function placeCard(rect: Rect | null): Placement {
  if (rect === null || typeof window === "undefined") return { kind: "center" };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_W, vw - GAP * 2);
  // Centre the card on the anchor, then pull it back inside the viewport. A
  // nav item at the far right of a wide header would otherwise hang off-screen.
  const left = Math.max(GAP, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - GAP));

  const spaceBelow = vh - (rect.top + rect.height + HOLE_PAD + GAP) - GAP;
  const spaceAbove = rect.top - HOLE_PAD - GAP - GAP;

  if (spaceBelow >= spaceAbove) {
    return {
      kind: "below",
      top: rect.top + rect.height + HOLE_PAD + GAP,
      left,
      maxHeight: Math.max(spaceBelow, MIN_CARD_HEIGHT),
    };
  }
  return {
    kind: "above",
    bottom: vh - rect.top + HOLE_PAD + GAP,
    left,
    maxHeight: Math.max(spaceAbove, MIN_CARD_HEIGHT),
  };
}

export function TourOverlay({
  open,
  initialMode = null,
  onClose,
}: {
  open: boolean;
  /**
   * Set when the caller already knows which track to run (a dedicated
   * "Quick tour" / "Full tour" button). Left `null` (the default) to open on
   * the mode chooser instead — the state every first-run auto-launch starts
   * from, since nobody has expressed a preference yet.
   */
  initialMode?: TourMode | null;
  onClose: (outcome: TourOutcome) => void;
}) {
  const [index, setIndex] = React.useState(0);
  const [mode, setMode] = React.useState<TourMode | null>(initialMode);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const steps = mode === "quick" ? TOUR_STEPS_SHORT : TOUR_STEPS;
  const step = mode ? steps[index] : null;
  const isFirst = index === 0;
  const isLast = mode ? index === steps.length - 1 : false;

  // Restart from the top each time the tour is opened. Resuming where someone
  // left off sounds friendlier than it is: the person most likely to reopen
  // this is one who wants the part they have forgotten, and dropping them into
  // step 9 of 15 with no context is not that. Same reasoning extends to the
  // track: an open with no `initialMode` reopens on the chooser rather than
  // silently reusing whichever track was run last.
  //
  // Adjusted during render off a remembered previous value rather than in an
  // effect. An effect would paint the stale step for one frame before
  // correcting it, which on a reopen is visibly wrong — the reader sees the
  // step they left on, then a jump.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setIndex(0);
      setMode(initialMode ?? null);
    }
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
        // The page stays put unless the anchor actually needs help: only the
        // portion hidden behind the sticky header or below the fold gets
        // scrolled into view, and only by as much as that requires. Anything
        // already on screen is left exactly where it is — the previous
        // `scrollIntoView({ block: "center" })` re-centred the page on every
        // step even when the target was already fully visible, which reads as
        // the background jumping around behind a card that is trying to hold
        // still.
        //
        // Feature-tested rather than called outright. Scrolling is a nicety —
        // the ring and the bubble are already positioned correctly without it —
        // so an environment that lacks it (jsdom under test, and any renderer
        // that stubs layout) should quietly go without rather than throw and
        // take the whole tour down.
        const vh = typeof window === "undefined" ? 0 : window.innerHeight;
        const hiddenAbove = found.rect.top < HEADER_OFFSET;
        const hiddenBelow = found.rect.top + found.rect.height > vh;
        if ((hiddenAbove || hiddenBelow) && typeof window.scrollBy === "function") {
          const delta = hiddenAbove
            ? found.rect.top - HEADER_OFFSET - GAP
            : found.rect.top + found.rect.height - vh + GAP;
          window.scrollBy({ top: delta, behavior: "smooth" });
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
      if (i >= steps.length - 1) {
        onClose("completed");
        return i;
      }
      return i + 1;
    });
  }, [onClose, steps.length]);

  const back = React.useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Escape leaves the tour. It is recorded as skipped rather than completed,
  // which changes nothing the user sees — both stop it auto-launching again —
  // but keeps "read to the end" and "escaped on step 2" distinguishable for
  // anyone later asking whether this thing is working.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose("skipped");
      // Arrow-key paging only applies once a track is chosen — on the
      // chooser screen there is no step to advance.
      else if (mode && e.key === "ArrowRight") next();
      else if (mode && e.key === "ArrowLeft") back();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, next, back, mode]);

  // Move focus onto the card on every step so a screen reader announces the new
  // heading and body rather than leaving the user on a button labelled "Next"
  // whose surrounding text has silently changed. The same DOM node persists
  // across steps (only its text changes), so its internal scroll position
  // persists too unless reset here — without this, a reader who scrolled to
  // the bottom of a long step lands on the next one already scrolled past its
  // own heading.
  React.useEffect(() => {
    if (!open) return;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    cardRef.current?.focus();
  }, [open, index]);

  if (!mounted || !open) return null;

  // Most visitors do not sit through a 16-step walkthrough — the honest
  // response to that is to offer a shorter one rather than pretend everyone
  // wants the long version. This chooser is what a first-run auto-launch
  // opens on, and what any "Start the tour" control opens on unless it was
  // given an explicit `mode` (see StartTourButton / TourControls.startTour).
  if (mode === null) {
    return createPortal(
      <ModeChooser
        onPick={(picked) => {
          setMode(picked);
          setIndex(0);
        }}
        onSkip={() => onClose("skipped")}
      />,
      document.body,
    );
  }

  if (!step) return null;

  const placement = placeCard(rect);
  const width = Math.min(CARD_W, (typeof window === "undefined" ? CARD_W : window.innerWidth) - GAP * 2);

  const cardStyle: React.CSSProperties =
    placement.kind === "below"
      ? { position: "fixed", top: placement.top, left: placement.left, width, maxHeight: placement.maxHeight }
      : placement.kind === "above"
        ? {
            position: "fixed",
            bottom: placement.bottom,
            left: placement.left,
            width,
            maxHeight: placement.maxHeight,
          }
        : {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width,
            maxHeight: "80vh",
          };

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
        className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Step {index + 1} of {steps.length}
              {mode === "quick" && " · quick tour"}
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

        <div ref={bodyRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {step.body.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-relaxed">
              {paragraph}
            </p>
          ))}
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

/**
 * The very first thing anyone sees, before a single tour step: a choice
 * between the 90-second version and the full 16-step walkthrough.
 *
 * Not a step in `TOUR_STEPS` because it isn't content about the app — it's a
 * decision about how much of the content to see, so it has no `data-tour`
 * anchor and nothing to spotlight. Centred, dimmed background, same card
 * chrome as a normal step for visual continuity.
 */
function ModeChooser({
  onPick,
  onSkip,
}: {
  onPick: (mode: TourMode) => void;
  onSkip: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="How would you like to learn GSPS?"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(2,6,23,0.72)]" />

      <div
        className="fixed left-1/2 top-1/2 flex max-h-[80vh] w-[min(360px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-balance">How would you like to learn GSPS?</h2>
          <button
            onClick={onSkip}
            aria-label="Leave the tour"
            className="-mr-1 flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-background hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          <p className="text-sm leading-relaxed">
            Most people don&apos;t sit through a full walkthrough, and that&apos;s a reasonable thing to want.
            Take the short version, the complete one, or skip this and read the Glossary and Settings pages as
            questions come up.
          </p>

          <button
            type="button"
            onClick={() => onPick("quick")}
            className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left transition-colors hover:border-accent"
          >
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              <span className="block text-sm font-medium">Quick tour — about 90 seconds</span>
              <span className="block text-sm text-muted">
                Just the essentials: practice money, where recommendations come from, the trade plan, and your
                Portfolio.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onPick("full")}
            className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left transition-colors hover:border-accent"
          >
            <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              <span className="block text-sm font-medium">Full tour — about 5 minutes</span>
              <span className="block text-sm text-muted">
                Every screen in the app: Scanner, Automation&apos;s exit ladder, Backtest, and the rest.
              </span>
            </span>
          </button>
        </div>

        <div className="flex items-center border-t border-border px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted">
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );
}

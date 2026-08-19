"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { TOUR_STEPS, tourReducer, isLastStep, INITIAL_TOUR_STATE } from "@/lib/onboarding/tour";
import { cn } from "@/lib/utils";

/**
 * First-run walkthrough of the real paper-trading flow on a symbol page. It
 * does not build a separate demo — it highlights the actual scan header,
 * signal card, order ticket, and exit-plan elements already on the page (each
 * tagged with a `data-tour-id`, see `TOUR_STEPS` for which ones) and explains
 * them in place, one at a time.
 *
 * Rendered by `TickerView` once a "Take the tour" banner is clicked; that
 * parent owns whether the banner shows at all (it checks the persisted
 * onboarding prefs via `shouldOfferTour`) and is told when the tour ends so it
 * can persist completion.
 */
export function OnboardingTour({ onFinish }: { onFinish: (completed: boolean) => void }) {
  const [state, dispatch] = useReducer(tourReducer, { ...INITIAL_TOUR_STATE, active: true });
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Whether the tour is ending because the reader reached the last step
  // ("Done") vs. closed it early ("Skip"/the X) — read once, in the effect
  // below, at the moment `active` flips false.
  const completedRef = useRef(false);

  const step = TOUR_STEPS[state.stepIndex];

  useEffect(() => {
    if (!state.active) return;

    let cleanupListeners: (() => void) | null = null;
    // Deferred rather than run synchronously in the effect body: the target
    // is measured (and re-measured on resize/scroll) purely to synchronize
    // this component's own overlay with an *external* element's position, so
    // it belongs in a callback rather than the effect body itself.
    const settle = setTimeout(() => {
      const el = document.getElementById(step.targetId);
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // The scroll above is animated, so the target's position isn't final on
      // the frame it starts — a short delay lets it settle before the
      // highlight box measures where to sit.
      const timer = setTimeout(() => setRect(el.getBoundingClientRect()), 300);

      const reposition = () => setRect(el.getBoundingClientRect());
      window.addEventListener("resize", reposition);
      window.addEventListener("scroll", reposition, { passive: true });
      cleanupListeners = () => {
        clearTimeout(timer);
        window.removeEventListener("resize", reposition);
        window.removeEventListener("scroll", reposition);
      };
    }, 0);

    return () => {
      clearTimeout(settle);
      cleanupListeners?.();
    };
  }, [state.active, state.stepIndex, step.targetId]);

  useEffect(() => {
    if (!state.active) onFinish(completedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.active]);

  if (!state.active) return null;

  const wasLastStep = isLastStep(state.stepIndex);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label="Guided tour">
      {/* Dimmed backdrop with a cut-out around the highlighted element. */}
      <div className="absolute inset-0 bg-black/60" />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-lg ring-4 ring-accent transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
          }}
        />
      )}

      <div className="absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-6">
        <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-4 shadow-lg sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold sm:text-base">{step.title}</h2>
            <button
              onClick={() => {
                completedRef.current = false;
                dispatch({ type: "close" });
              }}
              aria-label="Close tour"
              className="min-h-8 min-w-8 shrink-0 cursor-pointer rounded-lg text-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-sm text-muted">{step.body}</p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex gap-1">
              {TOUR_STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    i === state.stepIndex ? "bg-accent" : "bg-border",
                  )}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {state.stepIndex > 0 && (
                <Button variant="outline" size="sm" onClick={() => dispatch({ type: "prev" })}>
                  Back
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  if (wasLastStep) completedRef.current = true;
                  dispatch({ type: "next" });
                }}
              >
                {wasLastStep ? "Done" : "Next"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

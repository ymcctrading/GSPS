"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A box that scrolls sideways when its content is wider than the screen, and
 * says so.
 *
 * A wide grid (the 20-column options chain, the portfolio ledger) scrolls
 * inside its own box rather than stretching the page; the body clips anything
 * wider than the screen (`overflow-x: clip` in globals.css). On a phone that box
 * is swiped. With a mouse its scrollbar sits under the last row, often off
 * screen, so the columns past the edge looked like they were not there at all
 * (reported from a 1366px laptop, 2026-11-12). So whenever the content is wider
 * than the box, a small bar above it names that and offers left and right
 * buttons, and the box itself takes focus so the arrow keys scroll it. When
 * everything fits, nothing extra is drawn.
 *
 * `min-w-0 max-w-full` is what stops the content from setting the page's
 * width: without it a phone gets a body wider than the screen and every fixed
 * element ends up clipped.
 */
export function ScrollX({
  className,
  children,
  label = "Table",
}: {
  className?: string;
  children: React.ReactNode;
  /** Names the scrolling region for screen readers. */
  label?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState<{ overflow: boolean; atStart: boolean; atEnd: boolean }>({
    overflow: false,
    atStart: true,
    atEnd: true,
  });

  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { overflow: max > 1, atStart: el.scrollLeft <= 1, atEnd: el.scrollLeft >= max - 1 };
    setEdges((prev) =>
      prev.overflow === next.overflow && prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next,
    );
  }, []);

  // Rows arriving change the content's width without resizing the box or,
  // when the table is held to `max-width: 100%`, the table element itself, so
  // re-measure after every render (new children mean a render here).
  React.useLayoutEffect(() => {
    measure();
  });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    // A child that loads its own rows re-renders without this box re-rendering.
    let mo: MutationObserver | undefined;
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(measure);
      mo.observe(el, { childList: true, subtree: true });
    }
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [measure]);

  const scrollBy = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: "smooth" });
  };

  return (
    <div className="w-full min-w-0 max-w-full">
      {edges.overflow && (
        <div className="mb-1 flex items-center justify-end gap-1 text-xs text-muted">
          <span className="mr-1">More columns to the {edges.atEnd ? "left" : "right"}</span>
          <button
            type="button"
            aria-label="Scroll left"
            disabled={edges.atStart}
            onClick={() => scrollBy(-1)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-surface hover:text-foreground disabled:cursor-default disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            disabled={edges.atEnd}
            onClick={() => scrollBy(1)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-surface hover:text-foreground disabled:cursor-default disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      <div
        ref={ref}
        role={edges.overflow ? "region" : undefined}
        aria-label={edges.overflow ? label : undefined}
        tabIndex={edges.overflow ? 0 : undefined}
        className={cn("scroll-x w-full min-w-0 max-w-full", className)}
      >
        {children}
      </div>
    </div>
  );
}

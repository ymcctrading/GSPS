import * as React from "react";
import { cn } from "@/lib/utils";
import { ScrollX } from "@/components/ui/scroll-x";

/**
 * Wide grids (the 20-column options chain, the portfolio ledger) scroll inside
 * their own box. `max-w-full` plus the `min-w-0` on the wrapper is what stops
 * the table from setting the page's width — without it a phone gets a body
 * wider than the screen and every fixed element ends up clipped. `ScrollX`
 * carries that, and on any screen shows left/right buttons while columns sit
 * past the edge (a mouse has no swipe).
 */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <ScrollX>
      <table className={cn("w-full text-sm", className)} {...props} />
    </ScrollX>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("text-left text-xs uppercase tracking-wide text-muted", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-background/60", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap px-2 py-2 font-medium sm:px-3", className)} {...props} />;
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  // Rows stay one line so the horizontal scroller — not wrapped text — is what
  // absorbs a narrow screen; taller cells keep the tap target usable.
  return <td className={cn("whitespace-nowrap px-2 py-3 sm:px-3 sm:py-2.5", className)} {...props} />;
}

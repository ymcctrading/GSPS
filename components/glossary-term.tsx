"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { glossarySlug } from "@/components/glossary";
import { cn } from "@/lib/utils";

/**
 * Inline link from a term used in the product UI to its plain-language
 * definition on `/glossary`. Renders its children with a dotted underline and
 * a small info glyph, and deep-links to the matching entry so the reader
 * lands directly on the definition instead of having to search the page.
 *
 * `term` must match a `term` string in `components/glossary.tsx` exactly —
 * that file is the single source of truth for what's defined and where its
 * anchor lives (see `glossarySlug`). `label` overrides the visible text when
 * the term itself reads awkwardly inline (e.g. the glossary entry is named
 * "TP1 - Take Profit 1 (green line)" but the chart just says "TP1").
 */
export function GlossaryTerm({
  term,
  label,
  className,
}: {
  term: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/glossary#${glossarySlug(term)}`}
      title={`What is ${label ?? term}? Opens the glossary.`}
      className={cn(
        "inline-flex items-center gap-0.5 underline decoration-dotted decoration-muted underline-offset-2 hover:decoration-solid hover:text-accent",
        className,
      )}
    >
      {label ?? term}
      <Info className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
    </Link>
  );
}

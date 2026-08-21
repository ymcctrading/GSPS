/**
 * GSPS — the closest candidate, on a day when nothing qualifies.
 *
 * Guided's empty state used to be one sentence: "Nothing worth trading right
 * now." True, and it taught nothing — worse, it is indistinguishable from a
 * broken app to the exact user Guided exists for. This card is the same truth
 * with the reasoning attached: here is the closest thing the scan found, here is
 * its score, here is precisely what it lacks.
 *
 * ## Everything about this card is designed to not be a recommendation
 *
 * It renders a `NearMiss`, which is a different type from `Recommendation` and
 * carries no size, no dollar risk and no reward — so there is nothing here to
 * confirm even if a future edit tried. Visually it is deliberately unlike a
 * guided card: no accent-filled primary button, a muted border rather than the
 * bull/bear colouring an actionable setup gets, and the score shown openly
 * where a real card hides it behind "Why this one?". The only way forward is a
 * link to the full scan, where the user makes the call themselves with the
 * whole picture in front of them.
 *
 * A "Buy anyway" affordance on this card would undo the Execute gate that the
 * rest of Guided is built around, which is why there isn't one and shouldn't be.
 */

import Link from "next/link";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import type { NearMiss } from "@/lib/guided/near-miss";

export function NearMissCard({ nearMiss }: { nearMiss: NearMiss }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex min-w-0 flex-col gap-4 pt-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-muted">
            <Search className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Nothing meets the bar today</h3>
            <p className="text-sm text-muted">
              That happens, and standing aside is a position. Here is the closest the scan came, so the
              screen is not just empty.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold">{nearMiss.symbol}</span>
              <span className="font-mono text-sm text-muted">{formatUsd(nearMiss.currentPrice)}</span>
            </div>
            {/* Shown plainly, unlike a real card where the score sits behind a
                disclosure. There is no action to take here, so there is no
                reason to simplify the picture. */}
            <span className="rounded-full bg-warn/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-warn">
              {nearMiss.verdict} · {nearMiss.score}/{nearMiss.max}
            </span>
          </div>

          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">
            What it would still need
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {nearMiss.missing.map((reason) => (
              <li key={reason} className="flex gap-2 text-sm leading-relaxed">
                <span aria-hidden="true" className="text-muted">
                  ·
                </span>
                {reason}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-muted">
          Guided will not offer this one, and it is not a suggestion to trade. You can still open the full
          scan and decide for yourself, with the score and the levels in front of you.
        </p>

        <Link
          href={nearMiss.tickerHref}
          className="w-fit text-sm font-medium text-accent hover:underline"
        >
          Open the full scan for {nearMiss.symbol} →
        </Link>
      </CardContent>
    </Card>
  );
}

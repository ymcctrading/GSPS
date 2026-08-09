import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScanFreshness } from "@/lib/scan/freshness";

/**
 * Says out loud that a list belongs to a session that has closed.
 *
 * The four price columns are 15-minute-bar levels — an entry a penny beyond a
 * signal candle, a stop a penny beyond the other side. They are precise inside
 * the session that produced them and meaningless outside it, and nothing about
 * how they render says which. A trader reading "$322.81 / $321.92" cannot tell
 * Friday's plan from this morning's, so the page has to tell them.
 *
 * Two levels, because the two situations are not the same. One session behind
 * is the ordinary state of the dashboard before the day's scan has run: worth
 * stating, not worth alarm. Two or more means the scan has not run when it
 * should have, and the numbers on screen have no relationship to the tape.
 */
export function StaleScanNotice({
  freshness,
  scanDate,
}: {
  freshness: ScanFreshness;
  scanDate: string | null;
}) {
  if (!freshness.stale || !scanDate) return null;

  const hard = freshness.severity === "stale";
  const Icon = hard ? AlertTriangle : Clock;

  return (
    <div
      role={hard ? "alert" : "status"}
      className={cn(
        "flex min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        hard
          ? "border-bear/40 bg-bear/10 text-bear"
          : "border-border bg-background text-muted",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0">
        {hard ? (
          <>
            <span className="font-semibold">
              These prices are {freshness.sessionsBehind} sessions old.
            </span>{" "}
            Every entry, stop and target below was computed from the {scanDate} session&apos;s
            15-minute bars. They are not current levels — re-run the scan before acting on
            anything here.
          </>
        ) : (
          <>
            From the previous session ({scanDate}). The entries and stops below are
            15-minute-bar levels from that day; re-run the scan for today&apos;s.
          </>
        )}
      </p>
    </div>
  );
}

import { History } from "lucide-react";
import { RECONSTRUCTED_LABEL, RECONSTRUCTED_NOTE } from "@/lib/scan/reconstructed";

/**
 * Says that a day's list was rebuilt after the fact, not published by the
 * scan on its evening (`lib/scan/reconstructed.ts`). Shown above the list on
 * the dashboard pages; the note is in full, not only in a tooltip, because a
 * tooltip doesn't open on a phone.
 */
export function ReconstructedScanNotice({ reconstructed, scanDate }: { reconstructed: boolean; scanDate: string | null }) {
  if (!reconstructed || !scanDate) return null;
  return (
    <div
      role="status"
      className="flex min-w-0 items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-muted"
    >
      <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0">
        <span className="font-semibold">
          {RECONSTRUCTED_LABEL} ({scanDate}).
        </span>{" "}
        {RECONSTRUCTED_NOTE}
      </p>
    </div>
  );
}

/** The short marker beside a date in a list of sessions, with the note on hover and for screen readers. */
export function ReconstructedMarker() {
  return (
    <span
      title={RECONSTRUCTED_NOTE}
      className="ml-1 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] font-normal text-muted"
    >
      <History className="h-3 w-3" aria-hidden />
      {RECONSTRUCTED_LABEL}
      <span className="sr-only">. {RECONSTRUCTED_NOTE}</span>
    </span>
  );
}

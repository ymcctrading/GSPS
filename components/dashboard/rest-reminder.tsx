"use client";

/**
 * The twice-yearly "close everything and rest" reminder (lib/gann/traderPrefs.ts).
 * Shows only inside a rest window, when switched on and not yet dismissed for
 * this half-year. A reminder only: nothing is closed for the trader. Also the
 * close-out reminder in the days before a set absence (A-EXIT-05).
 */

import { useGannRulePrefs } from "@/components/gann/use-gann-rule-prefs";

export function RestReminder() {
  const { restReminder, awayReminder, save } = useGannRulePrefs();
  return (
    <>
      {awayReminder && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-accent/40 bg-surface p-4" role="note">
          <div className="max-w-prose">
            <p className="text-sm font-medium">Go flat before you&apos;re away</p>
            <p className="mt-1 text-sm text-muted">{awayReminder.message}</p>
          </div>
          <button type="button" className="min-h-9 rounded-md border border-border px-3 text-sm" onClick={() => save({ awayFrom: null })}>
            Dismiss
          </button>
        </div>
      )}
      {restReminder && <RestNotice restReminder={restReminder} save={save} />}
    </>
  );
}

function RestNotice({
  restReminder,
  save,
}: {
  restReminder: NonNullable<ReturnType<typeof useGannRulePrefs>["restReminder"]>;
  save: ReturnType<typeof useGannRulePrefs>["save"];
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-accent/40 bg-surface p-4" role="note">
      <div className="max-w-prose">
        <p className="text-sm font-medium">Time to rest</p>
        <p className="mt-1 text-sm text-muted">{restReminder.message}</p>
      </div>
      <div className="flex gap-2 text-sm">
        <button type="button" className="min-h-9 rounded-md border border-border px-3" onClick={() => save({ restDismissedFor: restReminder.period })}>
          Dismiss until next time
        </button>
        <button type="button" className="min-h-9 rounded-md px-3 text-muted underline" onClick={() => save({ restReminder: false })}>
          Turn off
        </button>
      </div>
    </div>
  );
}

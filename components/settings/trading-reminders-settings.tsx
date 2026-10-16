"use client";

/**
 * The method's rules the trader can switch on or off (lib/gann/traderPrefs.ts):
 * the round-number notice, the twice-yearly rest reminder, and the close-out
 * reminder before an absence. All are reminders; none changes a plan or
 * closes a trade.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/gann/switch";
import { useGannRulePrefs } from "@/components/gann/use-gann-rule-prefs";

export function TradingRemindersSettings() {
  const { prefs, error, save } = useGannRulePrefs();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trading reminders</CardTitle>
        <CardDescription>Reminders drawn from the method&apos;s own rules. They never change a plan or close a trade.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Round numbers</p>
            <p className="text-xs text-muted">
              Say when price is close to a round number such as 50, 100 or 200. Orders gather there, so
              moves often stall just short of them.
            </p>
          </div>
          <Switch
            label="Round-number notices"
            checked={prefs.roundNumberNotices}
            onChange={() => save({ roundNumberNotices: !prefs.roundNumberNotices })}
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Rest twice a year</p>
            <p className="text-xs text-muted">
              Around June 21 and December 21, a reminder to close out your trades and take a break
              before starting fresh.
            </p>
          </div>
          <Switch
            label="Twice-yearly rest reminder"
            checked={prefs.restReminder}
            onChange={() => save({ restReminder: !prefs.restReminder })}
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Going away</p>
            <p className="text-xs text-muted">
              Set the day you&apos;ll be away from the market. In the days before it, a reminder to close
              out your trades so nothing moves against you while you can&apos;t watch it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Away from"
              className="min-h-9 rounded-md border border-border bg-surface px-2 text-sm"
              value={prefs.awayFrom ?? ""}
              onChange={(e) => save({ awayFrom: e.target.value || null })}
            />
            {prefs.awayFrom && (
              <button type="button" className="text-xs text-muted underline" onClick={() => save({ awayFrom: null })}>
                Clear
              </button>
            )}
          </div>
        </div>
        {error && <p className="text-xs text-bear">{error}</p>}
      </CardContent>
    </Card>
  );
}

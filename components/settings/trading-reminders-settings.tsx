"use client";

/**
 * Two of the method's rules the trader can switch on or off
 * (lib/gann/traderPrefs.ts): the round-number notice and the twice-yearly
 * rest reminder. Both are reminders; neither changes a plan or closes a trade.
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
        {error && <p className="text-xs text-bear">{error}</p>}
      </CardContent>
    </Card>
  );
}

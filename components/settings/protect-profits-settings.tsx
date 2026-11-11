"use client";

/**
 * The member's "Protect profits" switch (lib/gann/traderPrefs.ts,
 * `protectProfits`; the rule is in lib/trade/protocol-exit.ts). Unlike the
 * reminders, it changes how an open trade is exited, so it has its own card.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/gann/switch";
import { useTradeRulePrefs } from "@/components/gann/use-gann-rule-prefs";

export function ProtectProfitsSettings() {
  const { prefs, error, save } = useTradeRulePrefs();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Exits</CardTitle>
        <CardDescription>How GSPS takes you out of a trade that is working.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Protect profits</p>
            <p className="text-xs text-muted">
              Sell the whole position automatically at the MTP (master take profit), and once price
              reaches TP1, keep the stop at or above your entry so the trade can no longer end at a
              loss. When off, the position stays in past the MTP with the stop moved up behind it,
              until the stop is hit or the trend turns. Applies to paper and live trades, including
              ones already open. Turning it off doesn&apos;t cancel an MTP order already resting at your
              broker for an open live trade.
            </p>
          </div>
          <Switch
            label="Protect profits"
            checked={prefs.protectProfits}
            onChange={() => save({ protectProfits: !prefs.protectProfits })}
          />
        </div>
        {error && <p className="text-xs text-bear">{error}</p>}
      </CardContent>
    </Card>
  );
}

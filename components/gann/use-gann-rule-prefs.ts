"use client";

/**
 * The trader's switches for Gann's round-number notice, the rest reminder and
 * the portfolio manager's round-number setting (`lib/gann/traderPrefs.ts`),
 * read from and saved to `/api/settings/gann-rules`. Until the read returns,
 * the defaults apply, so a notice that defaults on shows at once.
 */

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_GANN_RULE_PREFS, type GannRulePrefs } from "@/lib/gann/traderPrefs";

export interface RestReminder {
  period: string;
  opens: string;
  closes: string;
  message: string;
}

export function useGannRulePrefs() {
  const [prefs, setPrefs] = useState<GannRulePrefs>(DEFAULT_GANN_RULE_PREFS);
  const [restReminder, setRestReminder] = useState<RestReminder | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/gann-rules")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { prefs?: GannRulePrefs; restReminder?: RestReminder | null } | null) => {
        if (cancelled || !body) return;
        if (body.prefs) setPrefs(body.prefs);
        setRestReminder(body.restReminder ?? null);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (patch: Partial<GannRulePrefs>) => {
    setError(null);
    const res = await fetch("/api/settings/gann-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = (await res.json().catch(() => ({}))) as { prefs?: GannRulePrefs; error?: string };
    if (!res.ok || !body.prefs) {
      setError(body.error ?? "Couldn't save that setting.");
      return false;
    }
    setPrefs(body.prefs);
    if (patch.restDismissedFor !== undefined || patch.restReminder === false) setRestReminder(null);
    return true;
  }, []);

  return { prefs, restReminder, loaded, error, save };
}

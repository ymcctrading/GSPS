"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * Entry point into the custom-script Strategy Modes manager
 * (`/settings/scripts`, `components/settings/custom-script-editor.tsx`) —
 * AGENTS.md's "Strategy Modes" section, `docs/STRATEGY_MODES.md`'s
 * "Custom-script / plugin system". Same off-the-main-nav placement
 * `components/app/nav.tsx`'s own header comment documents for Glossary: a
 * destination reachable from a plain-text link on the Settings page rather
 * than promoted into the nav's seven-item tab-bar ceiling.
 *
 * Server-resolved via `/api/strategy-plugins`'s `authoringEnabled` field
 * (`lib/entitlements/policy.ts#customScriptAuthoringEnabled`, Wall Street
 * tier only) — renders nothing for every other tier, same "render nothing
 * rather than a disabled control" convention `strategy-mode-settings.tsx`
 * already uses for Novice.
 */
export function CustomScriptsSettings() {
  const [authoringEnabled, setAuthoringEnabled] = useState<boolean | null>(null);
  const [scriptCount, setScriptCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/strategy-plugins")
      .then((res) => (res.ok ? res.json() : { plugins: [], authoringEnabled: false }))
      .then((body: { plugins?: unknown[]; authoringEnabled?: boolean }) => {
        if (cancelled) return;
        setAuthoringEnabled(body.authoringEnabled ?? false);
        setScriptCount(body.plugins?.length ?? 0);
      })
      .catch(() => !cancelled && setAuthoringEnabled(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!authoringEnabled) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom scripts</CardTitle>
        <CardDescription>
          Write your own entry/stop/target rules in a small, safe rule language and try them
          against a symbol&apos;s history — a parallel, clearly-labeled system that never touches
          GSPS&apos;s own structural trade plan or scored verdict.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/settings/scripts" className="text-sm font-medium text-accent hover:underline">
          Manage your scripts{scriptCount > 0 ? ` (${scriptCount})` : ""} →
        </Link>
      </CardContent>
    </Card>
  );
}

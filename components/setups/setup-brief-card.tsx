"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BriefSections } from "@/components/setups/setup-card";
import { briefMatchesLevels, briefVoiceOf, voiced } from "@/lib/setups/card";
import type { PublicScanResult } from "@/lib/types";
import { formatUsd } from "@/lib/utils";
import { useTerms } from "@/components/vocabulary";
import type { TermId } from "@/lib/school/terms";

// The entry stays "Entry"; every other level reads in the member's words (lib/school/terms.ts).
const ROLE_TERM = { stop: "stopLoss", tp1: "tp1", tp2: "tp2", mtp: "mtp" } as const satisfies Record<string, TermId>;

/**
 * The setup brief on the ticker page (owner, 2026-11-11): the same reading
 * the setup card opens to, so a setup reads the same on the list and on its
 * own page (Correspondence). Shown only while the brief prices the plan the
 * page shows, so a kept plan from an earlier visit never pairs with
 * another scan's brief.
 */
export function SetupBriefCard({ result, exactScoreDisplayEnabled }: { result: PublicScanResult; exactScoreDisplayEnabled: boolean }) {
  const term = useTerms();
  const brief = result.brief;
  if (!brief || !result.levels) return null;
  const { entry, stopLoss, takeProfit1, masterProfit } = result.levels;
  if (!briefMatchesLevels(brief, { entry, stop: stopLoss, tp1: takeProfit1, mtp: masterProfit })) return null;
  const voice = briefVoiceOf(exactScoreDisplayEnabled);
  return (
    <Card>
      <CardHeader>
        <CardTitle>The setup, both sides</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed">{voiced(brief.call, voice)}</p>
        <p className="text-sm leading-relaxed">{voiced(brief.decidingLine, voice)}</p>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {brief.plan.map((l) => (
            <div key={l.role}>
              <dt className="text-[11px] uppercase tracking-wide text-muted">{l.role === "entry" ? "Entry" : term(ROLE_TERM[l.role])}</dt>
              <dd className="font-mono text-sm">
                {formatUsd(l.price)}
                {l.multiple != null && <span className="ml-1.5 text-[11px] text-muted">{l.multiple.toFixed(1)}× risk</span>}
              </dd>
              <dd className="text-[11px] leading-snug text-muted">{voiced(l.reason, voice)}</dd>
            </div>
          ))}
        </dl>
        <BriefSections brief={brief} voice={voice} />
      </CardContent>
    </Card>
  );
}

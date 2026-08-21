"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchWithTimeout, formatUsd } from "@/lib/utils";
import { DATA_RETENTION_WINDOW_LABEL } from "@/lib/config";
import {
  EXECUTE_RULE_DETAIL,
  EXECUTE_RULE_LABEL,
  MASTER_RULE_DETAIL,
  MASTER_RULE_LABEL,
  STOP_RULE_DETAIL,
  STOP_RULE_LABEL,
  TP1_RULE_DETAIL,
  TP1_RULE_LABEL,
} from "@/lib/trade/protocol-rules";
import { GuidedCapsForm } from "@/components/guided/guided-caps-form";
import { AccountSettings } from "@/components/settings/account-settings";
import { BillingSettings } from "@/components/settings/billing-settings";
import { StartTourButton } from "@/components/onboarding/tour-provider";
import Link from "next/link";
import { Link2, Landmark, Compass } from "lucide-react";

interface SnapAccounts {
  enabled: boolean;
  accounts: { id: string; name: string; institution: string; balance: number | null; currency: string }[];
  error?: string;
}

export default function SettingsPage() {
  const [snap, setSnap] = useState<SnapAccounts | null>(null);
  const [snapError, setSnapError] = useState(false);
  const [paperOk, setPaperOk] = useState<boolean | null>(null);
  const [paperError, setPaperError] = useState(false);

  useEffect(() => {
    fetchWithTimeout("/api/snaptrade/accounts")
      .then((res) => res.json())
      .then(setSnap)
      .catch(() => setSnapError(true));
    fetchWithTimeout("/api/portfolio")
      .then((res) => setPaperOk(res.ok))
      .catch(() => setPaperError(true));
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Settings</h1>
        <p className="text-sm text-muted">Brokerage connections and protocol risk preferences.</p>
      </div>

      {/*
        Placed above the account and billing cards on purpose. Someone who has
        come to Settings confused is more likely to be looking for help than for
        their subscription, and the tour is the cheapest answer to "what does
        this do" that this app has.
      */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-accent" /> Getting started
          </CardTitle>
          <CardDescription>
            A plain-English walkthrough of every part of GSPS. Take it as many times as you like.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <StartTourButton className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-accent">
            <Compass className="h-4 w-4" />
            Show me around
          </StartTourButton>
          <Link href="/welcome" className="text-sm font-medium text-accent hover:underline">
            Or read it as a page
          </Link>
        </CardContent>
      </Card>

      <AccountSettings />

      <BillingSettings />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-accent" /> Paper trading
          </CardTitle>
          <CardDescription>
            Simulated account powered by Alpaca — every protocol order routes here by default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paperOk === null ? (
            paperError ? (
              <Badge variant="warn">Couldn&apos;t check paper trading status</Badge>
            ) : (
              <p className="text-sm text-muted">Checking…</p>
            )
          ) : paperOk ? (
            <Badge variant="bull">Connected</Badge>
          ) : (
            <Badge variant="warn">Not configured — add Alpaca API keys to enable</Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-accent" /> External brokerages
          </CardTitle>
          <CardDescription>
            Link Webull, Robinhood, Schwab, and more via SnapTrade to see balances and (soon) route live orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {snap === null ? (
            snapError ? (
              <Badge variant="warn">Couldn&apos;t load external brokerage status</Badge>
            ) : (
              <p className="text-sm text-muted">Checking…</p>
            )
          ) : !snap.enabled ? (
            <Badge variant="muted">Coming soon — external linking is not enabled yet</Badge>
          ) : (
            <>
              {snap.accounts.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {snap.accounts.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-sm"
                    >
                      <span>
                        <span className="font-medium">{a.institution}</span>{" "}
                        <span className="text-muted">· {a.name}</span>
                      </span>
                      <span className="font-mono">{a.balance != null ? formatUsd(a.balance) : "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
              <a href="/api/snaptrade/connect">
                <Button variant="outline">
                  {snap.accounts.length > 0 ? "Link another brokerage" : "Link a brokerage"}
                </Button>
              </a>
              {snap.error && <p className="text-sm text-bear">{snap.error}</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Protocol risk rules</CardTitle>
          <CardDescription>
            What the engine actually prices, read from the same constants it computes with.
            Customization arrives in a later release.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <ProtocolRule label="Stop loss" value={STOP_RULE_LABEL} detail={STOP_RULE_DETAIL} />
            <ProtocolRule label="Take profit 1" value={TP1_RULE_LABEL} detail={TP1_RULE_DETAIL} />
            <ProtocolRule label="Final target" value={MASTER_RULE_LABEL} detail={MASTER_RULE_DETAIL} />
            <ProtocolRule label="Execute threshold" value={EXECUTE_RULE_LABEL} detail={EXECUTE_RULE_DETAIL} />
          </ul>
        </CardContent>
      </Card>

      <GuidedCapsForm />

      <Card>
        <CardHeader>
          <CardTitle>Data & privacy</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Historical scan data is retained for <span className="font-medium text-foreground">{DATA_RETENTION_WINDOW_LABEL}</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * One protocol rule: the headline number, and the sentence that says what it
 * really means. The detail is on the page rather than behind a tooltip because
 * the headline alone is what used to be misleading.
 */
function ProtocolRule({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <li className="rounded-lg border border-border bg-background px-4 py-3">
      <span className="text-muted">{label}:</span> <span className="font-medium">{value}</span>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </li>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import { Link2, Landmark } from "lucide-react";

interface SnapAccounts {
  enabled: boolean;
  accounts: { id: string; name: string; institution: string; balance: number | null; currency: string }[];
  error?: string;
}

export default function SettingsPage() {
  const [snap, setSnap] = useState<SnapAccounts | null>(null);
  const [paperOk, setPaperOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/snaptrade/accounts")
      .then((res) => res.json())
      .then(setSnap)
      .catch(() => setSnap({ enabled: false, accounts: [] }));
    fetch("/api/portfolio")
      .then((res) => setPaperOk(res.ok))
      .catch(() => setPaperOk(false));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">Brokerage connections and protocol risk preferences.</p>
      </div>

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
            <p className="text-sm text-muted">Checking…</p>
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
            <p className="text-sm text-muted">Checking…</p>
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
          <CardDescription>The defaults every scan uses. Customization arrives in a later release.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li className="rounded-lg border border-border bg-background px-4 py-3">Recommended stop: <span className="font-medium">12–18% of price paid</span></li>
            <li className="rounded-lg border border-border bg-background px-4 py-3">Take profit 1: <span className="font-medium">2 : 1 reward-to-risk</span></li>
            <li className="rounded-lg border border-border bg-background px-4 py-3">Master profit: <span className="font-medium">3 : 1 reward-to-risk</span></li>
            <li className="rounded-lg border border-border bg-background px-4 py-3">Execute threshold: <span className="font-medium">score 7+ of 9</span></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

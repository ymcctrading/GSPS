"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { referralPath } from "@/lib/referral";
import { Share2 } from "lucide-react";

interface ReferralStats {
  username: string | null;
  clickCount: number;
  signupCount: number;
}

/**
 * A user's own referral link, and how it's doing. The link is `/r/<username>`
 * — no separate code to generate, because the username Account Settings
 * already lets a user set is the whole point: a link a friend recognises as
 * theirs, not an opaque token.
 *
 * No commission or reward figure here yet — this ships the link and the
 * counts it needs to eventually be worth something, not the payout itself.
 */
export function ReferralSettings() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/referral")
      .then((res) => res.json())
      .then((body: ReferralStats) => !cancelled && setStats(body))
      .catch(() => !cancelled && setStats({ username: null, clickCount: 0, signupCount: 0 }));
    return () => {
      cancelled = true;
    };
  }, []);

  const link =
    stats?.username && typeof window !== "undefined"
      ? `${window.location.origin}${referralPath(stats.username)}`
      : null;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the input is still selectable by hand.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-accent" /> Refer a friend
        </CardTitle>
        <CardDescription>
          Share your link. Anyone who signs up through it is credited to you here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {stats === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !stats.username ? (
          <p className="text-sm text-muted">
            Set a username in Account above to get your referral link — it&apos;s built from it.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <Input readOnly value={link ?? ""} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" onClick={() => void copyLink()}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                <p className="text-xs text-muted">Link clicks</p>
                <p className="text-lg font-semibold">{stats.clickCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                <p className="text-xs text-muted">Signups credited to you</p>
                <p className="text-lg font-semibold">{stats.signupCount}</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { GuidedCard } from "@/components/guided/guided-card";
import { formatUsd } from "@/lib/utils";
import { GUIDED_DISCLOSURE } from "@/lib/guided/config";
import type { Recommendation } from "@/lib/guided/service";

interface GuidedResponse {
  enabled: boolean;
  blockedReason: string | null;
  disclosure: string;
  recommendations: Recommendation[];
  standAside?: boolean;
  caps?: { riskPct: number; maxTradesPerDay: number; maxDeployedPct: number };
  usage?: { tradesToday: number; deployedPct: number };
  error?: string;
}

/**
 * Guided Decision Mode, client side.
 *
 * Deliberately plain: a list of at most three cards, each with one action. Two
 * things it does not do, both on purpose — it does not auto-refresh into a new
 * set of recommendations after an execution (that is a slot machine), and it
 * does not collapse the confirmation step for a strong setup (the human tap is
 * a checkpoint, and a checkpoint you can skip is not one).
 */
export function GuidedMode() {
  const router = useRouter();
  const [data, setData] = useState<GuidedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<Recommendation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);

  // Bumping this re-runs the request. The effect below owns every state change
  // the load produces, so nothing is set synchronously from inside it.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/guided")
      .then(async (res) => {
        const body: GuidedResponse = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function dismiss(rec: Recommendation) {
    if (!rec.id) return;
    setBusyId(rec.id);
    try {
      await fetch("/api/guided", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rec.id }),
      });
      setData((d) =>
        d ? { ...d, recommendations: d.recommendations.filter((r) => r.id !== rec.id) } : d,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function execute(rec: Recommendation) {
    if (!rec.id) return;
    setBusyId(rec.id);
    setError(null);
    try {
      const res = await fetch("/api/guided/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rec.id }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        // Anything refused at submission has also been resolved server-side, so
        // the card on screen is stale either way.
        setData((d) =>
          d ? { ...d, recommendations: d.recommendations.filter((r) => r.id !== rec.id) } : d,
        );
        return;
      }
      setConfirming(null);
      setPlaced(`${rec.qty} ${rec.symbol} bought. Taking you to your portfolio…`);
      // Straight to Portfolio with the new position and its real bracket
      // levels — not back to a screen offering the next trade.
      router.push("/portfolio");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted">Checking today&apos;s setups…</p>;

  if (error && !data) {
    return (
      <Notice title="Guided Mode couldn't load">
        {error} <button onClick={reload} className="text-accent hover:underline cursor-pointer">Try again</button>
      </Notice>
    );
  }

  if (data && !data.enabled) {
    return <Notice title="Guided Mode is off right now">{data.blockedReason}</Notice>;
  }

  const recs = data?.recommendations ?? [];

  return (
    <div className="flex flex-col gap-4">
      {placed && <Notice title="Order placed">{placed}</Notice>}
      {error && <Notice title="That didn't go through">{error}</Notice>}

      {data?.caps && data.usage && (
        <p className="text-sm text-muted">
          Risking {data.caps.riskPct}% of your paper equity per trade · {data.usage.tradesToday} of{" "}
          {data.caps.maxTradesPerDay} guided trades today · {data.usage.deployedPct.toFixed(0)}% of{" "}
          {data.caps.maxDeployedPct}% deployed.
        </p>
      )}

      {recs.length === 0 ? (
        <Notice title="Nothing worth trading right now">
          No setup cleared today&apos;s bar. Standing aside is a position — the{" "}
          <Link href="/dashboard" className="text-accent hover:underline">
            dashboard
          </Link>{" "}
          still has everything the scanner found.
        </Notice>
      ) : (
        recs.map((rec) => (
          <GuidedCard
            key={rec.id}
            rec={rec}
            busy={busyId === rec.id}
            onConfirm={() => setConfirming(rec)}
            onDismiss={() => void dismiss(rec)}
          />
        ))
      )}

      <ConfirmDialog
        rec={confirming}
        busy={busyId !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && void execute(confirming)}
      />
    </div>
  );
}

/**
 * The checkpoint. Restates symbol, side, size, risk and reward in plain numbers,
 * with the disclosure immediately above the button rather than anywhere else.
 */
function ConfirmDialog({
  rec,
  busy,
  onClose,
  onConfirm,
}: {
  rec: Recommendation | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={rec !== null}
      onClose={onClose}
      title={rec ? `Buy ${rec.qty} ${rec.symbol}?` : ""}
      description="Paper trading only. This places a real order in your simulated account."
      footer={
        rec && (
          <div className="flex flex-col gap-3">
            <p className="text-xs leading-relaxed text-muted">{GUIDED_DISCLOSURE}</p>
            <div className="flex gap-2">
              <Button onClick={onConfirm} disabled={busy} size="lg" className="flex-1">
                {busy ? "Placing…" : `Confirm — buy ${rec.qty} ${rec.symbol}`}
              </Button>
              <Button onClick={onClose} disabled={busy} variant="outline" size="lg">
                Cancel
              </Button>
            </div>
          </div>
        )
      }
    >
      {rec && (
        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Symbol" value={rec.symbol} />
          <Row label="Action" value="Buy" />
          <Row label="Size" value={`${rec.qty} shares (${formatUsd(rec.notionalUsd, 0)})`} />
          <Row label="If it hits the stop" value={`− ${formatUsd(rec.riskUsd, 0)}`} />
          <Row label="If it reaches the target" value={`+ ${formatUsd(rec.rewardUsd, 0)}`} />
          <p className="mt-1 leading-relaxed text-muted">{rec.exitSentence}</p>
        </dl>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}

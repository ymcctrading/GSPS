"use client";

/**
 * The graduation exam (lib/school/graduationExam.ts): real past charts, shown
 * only up to a date, with the student reading the trend, deciding whether
 * there's a trade and, if so, choosing the stop (and for Pro the entry) and
 * sizing it. Graded on the server against the platform's rules; each chart then
 * plays forward so the student sees what happened, which is not part of the
 * grade.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Trend = "up" | "down" | "sideways";
type Decision = "trade" | "wait";
interface Choice { id: string; price: number }
interface ScenarioView {
  symbol: string;
  asOf: string;
  bars: { t: string; o: number; h: number; l: number; c: number }[];
  entryChoices: Choice[];
  stopChoices: Choice[];
}
interface Answer { trend?: Trend; decision?: Decision; entryChoiceId?: string; stopChoiceId?: string; shares?: number }
interface ItemResult { item: string; correct: boolean; explanation: string }
interface Grade { score: number; passed: boolean; scenarios: { items: ItemResult[]; playedOut: string }[] }
interface Status {
  eligible: boolean;
  passedAt: string | null;
  attempt: { id: string; scenarios: ScenarioView[] } | null;
  lastScore: number | null;
  retakeAt: string | null;
}

const TITLE: Record<string, string> = {
  novice_to_pro: "Novice graduation exam",
  pro_to_expert: "Pro graduation exam",
};

function Chart({ bars }: { bars: ScenarioView["bars"] }) {
  const w = 600;
  const h = 200;
  const lo = Math.min(...bars.map((b) => b.l));
  const hi = Math.max(...bars.map((b) => b.h));
  const y = (p: number) => h - ((p - lo) / (hi - lo || 1)) * (h - 10) - 5;
  const step = w / bars.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full rounded-md border border-border bg-background" role="img" aria-label="Price chart up to the exam date">
      {bars.map((b, i) => {
        const x = i * step + step / 2;
        const up = b.c >= b.o;
        return (
          <g key={b.t} className={up ? "text-bull" : "text-bear"}>
            <line x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} stroke="currentColor" strokeWidth={1} />
            <rect x={x - step * 0.3} width={step * 0.6} y={y(Math.max(b.o, b.c))} height={Math.max(1, Math.abs(y(b.o) - y(b.c)))} fill="currentColor" />
          </g>
        );
      })}
      <text x={4} y={12} className="fill-current text-muted" fontSize={10}>{hi.toFixed(2)}</text>
      <text x={4} y={h - 4} className="fill-current text-muted" fontSize={10}>{lo.toFixed(2)}</text>
    </svg>
  );
}

function Options<T extends string>({ value, options, onChange }: { value?: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`min-h-9 rounded-md border px-3 text-sm ${value === o.v ? "border-accent bg-accent/10 font-medium" : "border-border"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function GraduationExam({ transition }: { transition: string }) {
  const pro = transition === "pro_to_expert";
  const [status, setStatus] = useState<Status | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/school/exam/${transition}`)
      .then((r) => r.json())
      .then((b) => (b.error ? setError(b.error) : setStatus(b)))
      .catch(() => setError("Couldn't load the exam."));
  }, [transition]);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/school/exam/${transition}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(b.error ?? "Couldn't start the exam.");
    setStatus((s) => (s ? { ...s, attempt: b.attempt } : s));
    setAnswers([]);
  }

  async function submit() {
    if (!status?.attempt) return;
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/school/exam/${transition}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", attemptId: status.attempt.id, answers }),
    });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(b.error ?? "Couldn't grade the exam.");
    setGrade(b.grade);
  }

  const set = (i: number, patch: Answer) => setAnswers((a) => { const n = [...a]; n[i] = { ...n[i], ...patch }; return n; });

  if (!TITLE[transition]) return <p className="text-sm text-muted">There&apos;s no exam here.</p>;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">{TITLE[transition]}</h1>
        <p className="text-sm text-muted">
          Mr. Bull and Mrs. Bear hand you five real charts, each stopped at a date in the past. Read the
          trend, decide whether there&apos;s a trade{pro ? ", pick the entry" : ""}, place the stop and size the
          position. You&apos;re graded on applying the rules, not on whether the trade made money. Pass with
          80% to graduate; if you miss, you can try again after a day.
        </p>
      </div>
      {error && <p className="text-sm text-bear">{error}</p>}
      {status?.passedAt && (
        <Card><CardContent className="py-4 text-sm"><Badge variant="bull">Graduated</Badge> You passed on {new Date(status.passedAt).toLocaleDateString()}. <Link className="underline" href="/promotion">Go to promotion →</Link></CardContent></Card>
      )}
      {status && !status.passedAt && !status.attempt && !grade && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
            {!status.eligible ? (
              <span className="text-muted">This exam is taken from the tier it graduates from.</span>
            ) : status.retakeAt && new Date(status.retakeAt) > new Date() ? (
              <span className="text-muted">Last score {Math.round((status.lastScore ?? 0) * 100)}%. You can retake it after {new Date(status.retakeAt).toLocaleString()}.</span>
            ) : (
              <Button onClick={start} disabled={busy}>{busy ? "Loading the charts…" : "Start the exam"}</Button>
            )}
          </CardContent>
        </Card>
      )}
      {status?.attempt && !grade && (
        <>
          {status.attempt.scenarios.map((s, i) => {
            const a = answers[i] ?? {};
            return (
              <Card key={`${s.symbol}-${s.asOf}`}>
                <CardHeader>
                  <CardTitle>Chart {i + 1}: {s.symbol}</CardTitle>
                  <CardDescription>Daily bars up to {s.asOf}. Nothing after that date is shown.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  <Chart bars={s.bars} />
                  <div><p className="mb-1 font-medium">Which way is the trend?</p>
                    <Options value={a.trend} onChange={(v) => set(i, { trend: v })} options={[{ v: "up", label: "Up" }, { v: "down", label: "Down" }, { v: "sideways", label: "Sideways" }]} /></div>
                  <div><p className="mb-1 font-medium">Is there a trade, or do you wait?</p>
                    <Options value={a.decision} onChange={(v) => set(i, { decision: v })} options={[{ v: "trade", label: "Trade" }, { v: "wait", label: "Wait" }]} /></div>
                  {a.decision === "trade" && (
                    <>
                      {pro && (
                        <div><p className="mb-1 font-medium">Where does the entry go?</p>
                          <Options value={a.entryChoiceId} onChange={(v) => set(i, { entryChoiceId: v })} options={s.entryChoices.map((c) => ({ v: c.id, label: c.price.toFixed(2) }))} /></div>
                      )}
                      <div><p className="mb-1 font-medium">Where does the stop go?</p>
                        <Options value={a.stopChoiceId} onChange={(v) => set(i, { stopChoiceId: v })} options={s.stopChoices.map((c) => ({ v: c.id, label: c.price.toFixed(2) }))} /></div>
                      <label className="flex flex-col gap-1">
                        <span className="font-medium">With a $10,000 account risking 1%, how many shares?</span>
                        <input type="number" min={0} className="w-40 rounded-md border border-border bg-background px-2 py-1" value={a.shares ?? ""} onChange={(e) => set(i, { shares: e.target.value === "" ? undefined : Math.floor(Number(e.target.value)) })} />
                      </label>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
          <Button onClick={submit} disabled={busy}>{busy ? "Grading…" : "Submit the exam"}</Button>
        </>
      )}
      {grade && (
        <>
          <Card>
            <CardContent className="py-4 text-sm">
              {grade.passed ? <Badge variant="bull">Graduated</Badge> : <Badge variant="warn">Not yet</Badge>} You scored {Math.round(grade.score * 100)}%.{" "}
              {grade.passed ? <Link className="underline" href="/promotion">Go to promotion →</Link> : "Review the notes below; you can try again after a day."}
            </CardContent>
          </Card>
          {grade.scenarios.map((r, i) => (
            <Card key={i}>
              <CardHeader><CardTitle>Chart {i + 1}: {status?.attempt?.scenarios[i]?.symbol}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {r.items.map((it) => (
                  <p key={it.item}><span className={it.correct ? "text-bull" : "text-bear"}>{it.correct ? "✓" : "✗"} {it.item}</span> — {it.explanation}</p>
                ))}
                <p className="text-muted">What happened next: {r.playedOut}</p>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

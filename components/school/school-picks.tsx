"use client";

/**
 * The learner's own charts for the School (lib/school/picks.ts): pick 3 to 9
 * markets, at least one US stock, before the first lesson, at any tier. Every
 * lesson that needs an example draws it from these. A learner who doesn't
 * know what to pick answers a few everyday questions and sees the public
 * companies behind their answers, offered as a starting point, never as
 * advice to buy.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import type { SchoolPicks } from "@/lib/school/picks";
import type { PickQuestion } from "@/lib/school/pickPrompts";
import { suggestionsFor } from "@/lib/school/pickPrompts";

export interface PicksResponse {
  picks: SchoolPicks | null;
  min: number;
  max: number;
  questions: PickQuestion[];
  markets: { symbol: string; name: string }[];
  keepNote: string;
}

export function useSchoolPicks() {
  const [data, setData] = useState<PicksResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unauthorized" | "error">("loading");
  function load() {
    fetch("/api/school/picks")
      .then(async (res) => {
        if (res.status === 401) return setState("unauthorized");
        if (!res.ok) return setState("error");
        setData((await res.json()) as PicksResponse);
        setState("ready");
      })
      .catch(() => setState("error"));
  }
  useEffect(load, []);
  return { data, state, reload: load, setData };
}

export function SchoolPicksPicker({
  config,
  onSaved,
  onCancel,
}: {
  config: PicksResponse;
  onSaved: (picks: SchoolPicks) => void;
  onCancel?: () => void;
}) {
  const [symbols, setSymbols] = useState<string[]>(config.picks?.symbols.map((s) => s.symbol) ?? []);
  const [typed, setTyped] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [showQuestions, setShowQuestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function add(raw: string) {
    const s = raw.trim().toUpperCase();
    if (!s) return;
    setSymbols((cur) => (cur.includes(s) || cur.length >= config.max ? cur : [...cur, s]));
    setTyped("");
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/school/picks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "Couldn't save your charts.");
      onSaved(json.picks as SchoolPicks);
    } finally {
      setSaving(false);
    }
  }

  const suggestions = suggestionsFor(answers);

  return (
    <Card className="border-accent/40">
      <CardHeader>
        <CardTitle>{config.picks ? "Change your charts" : "Pick your charts"}</CardTitle>
        <CardDescription>
          Choose at least {config.min} markets you&apos;d like to follow, and at least one US stock. Every lesson that
          needs an example will show it on these charts, using their most recent moves.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {symbols.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
              {s}
              <button
                type="button"
                aria-label={`Remove ${s}`}
                onClick={() => setSymbols((cur) => cur.filter((x) => x !== s))}
                className="text-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {symbols.length === 0 && <span className="text-sm text-muted">Nothing picked yet.</span>}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(typed);
          }}
        >
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="AAPL, BTC/USD, EUR/USD or /ES"
            aria-label="Add a symbol"
          />
          <Button type="submit" variant="outline" disabled={!typed.trim() || symbols.length >= config.max}>
            Add
          </Button>
        </form>

        <div className="space-y-2">
          <p className="text-xs text-muted">Popular choices for following the whole market:</p>
          <div className="flex flex-wrap gap-2">
            {config.markets.map((m) => (
              <Button key={m.symbol} type="button" size="sm" variant="outline" onClick={() => add(m.symbol)} title={m.name}>
                + {m.symbol}
              </Button>
            ))}
          </div>
        </div>

        {!showQuestions ? (
          <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => setShowQuestions(true)}>
            Not sure what to pick? Answer a few everyday questions.
          </button>
        ) : (
          <div className="space-y-4 rounded-lg border border-border p-3">
            {config.questions.map((q) => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium">{q.question}</p>
                <div className="flex flex-wrap gap-2">
                  {q.answers.map((a) => {
                    const on = answers.includes(a.id);
                    return (
                      <Button
                        key={a.id}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        aria-pressed={on}
                        onClick={() => setAnswers((cur) => (on ? cur.filter((x) => x !== a.id) : [...cur, a.id]))}
                      >
                        {a.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Public companies behind your answers</p>
                <p className="text-xs text-muted">
                  A starting point for charts to follow, not a suggestion to buy anything.
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <Button
                      key={s.symbol}
                      type="button"
                      size="sm"
                      variant={symbols.includes(s.symbol) ? "default" : "outline"}
                      onClick={() => add(s.symbol)}
                      title={`${s.name} (${s.because})`}
                    >
                      {s.symbol} · {s.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted">
          Futures and currency pairs can be picked, but their charts aren&apos;t available here yet, so lessons will show
          examples from your stocks and crypto until they are. {config.keepNote}
        </p>

        {error && <p className="text-sm text-bear">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" onClick={save} disabled={saving || symbols.length < config.min}>
            {saving ? "Saving…" : "Save my charts"}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The School home's card: the picker before the first pick, the picks and a change link after. */
export function SchoolPicksCard() {
  const { data, state, setData } = useSchoolPicks();
  const [editing, setEditing] = useState(false);
  if (state !== "ready" || !data) return null;
  if (!data.picks || editing) {
    return (
      <SchoolPicksPicker
        config={data}
        onSaved={(picks) => {
          setData({ ...data, picks });
          setEditing(false);
        }}
        onCancel={data.picks ? () => setEditing(false) : undefined}
      />
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your charts</CardTitle>
        <CardDescription>Lessons draw their examples from these markets&apos; most recent moves.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {data.picks.symbols.map((s) => (
          <span key={s.symbol} className="rounded-full border border-border px-3 py-1 text-sm">
            {s.symbol}
          </span>
        ))}
        <button type="button" className="ml-auto text-sm text-accent hover:underline" onClick={() => setEditing(true)}>
          Change my charts
        </button>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle } from "lucide-react";

interface ProgressResponse {
  programs: { id: string; label: string; gateStatus: string; consequence: string }[];
  academies: { id: string; title: string; gateStatus: "required" | "advisory"; complete: boolean; passedLessons: number; totalLessons: number }[];
  totalLessonsInCurriculum: number;
  gateTrace: { lesson: string; lab: string | null; recordedField: string; consequence: string; met: boolean }[];
}

type LoadState = "loading" | "unauthorized" | "error" | "ready";

export function ProgressView() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<ProgressResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/school/curriculum/progress")
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) return setState("unauthorized");
        if (!res.ok) return setState("error");
        setData(await res.json());
        setState("ready");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") return <p className="text-sm text-muted">Loading progress…</p>;
  if (state === "unauthorized") return <p className="text-sm text-muted">Sign in to see your progress.</p>;
  if (state === "error" || !data) return <p className="text-sm text-bear">Couldn&apos;t load progress. Try refreshing.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Progress &amp; Gate Status</h1>
        <p className="text-sm text-muted">
          {data.academies.reduce((sum, a) => sum + a.passedLessons, 0)}/{data.totalLessonsInCurriculum} lessons passed across the curriculum.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Programs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.programs.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{p.label}</p>
                <p className="text-xs text-muted">{p.consequence}</p>
              </div>
              <Badge variant={p.gateStatus === "required" ? "warn" : "muted"}>{p.gateStatus === "required" ? "Required" : "Advisory"}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Academies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.academies.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                {a.complete ? <CheckCircle2 className="h-4 w-4 text-bull" /> : <Circle className="h-4 w-4 text-muted" />}
                {a.title}
              </span>
              <span className="text-xs text-muted">
                {a.passedLessons}/{a.totalLessons}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Learning-to-Behavior Trace</CardTitle>
          <CardDescription>Which lesson/lab feeds which recorded field, and its real consequence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.gateTrace.map((row, i) => (
            <div key={i} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{row.lesson}</p>
                {row.met ? <Badge variant="bull">Met</Badge> : <Badge variant="muted">Not yet</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted">
                Writes <code className="rounded bg-background px-1">{row.recordedField}</code>
              </p>
              <p className="mt-1 text-xs text-muted">{row.consequence}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

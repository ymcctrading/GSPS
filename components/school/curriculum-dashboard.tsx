"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, CheckCircle2 } from "lucide-react";
import { SchoolDisclaimer } from "@/components/school/disclaimer";

interface AcademySummary {
  id: string;
  slug: string;
  number: number;
  title: string;
  outcome: string;
  gateStatus: "required" | "advisory";
  unlocked: boolean;
  complete: boolean;
  passedLessons: number;
  totalLessons: number;
}

interface MapResponse {
  programs: { id: string; label: string; gateStatus: string; consequence: string }[];
  academies: AcademySummary[];
}

type LoadState = "loading" | "unauthorized" | "error" | "empty" | "ready";

export function CurriculumDashboard() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<MapResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/school/curriculum/map")
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) return setState("unauthorized");
        if (!res.ok) return setState("error");
        const json = (await res.json()) as MapResponse;
        setData(json);
        setState(json.academies.length === 0 ? "empty" : "ready");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") return <p className="text-sm text-muted">Loading your curriculum…</p>;
  if (state === "unauthorized") return <p className="text-sm text-muted">Sign in to see your GSPS School progress.</p>;
  if (state === "error") return <p className="text-sm text-bear">Couldn&apos;t load School right now. Try refreshing.</p>;
  if (state === "empty" || !data) return <p className="text-sm text-muted">No curriculum content is published yet.</p>;

  const nextAcademy = data.academies.find((a) => a.unlocked && !a.complete);

  return (
    <div className="space-y-6">
      <SchoolDisclaimer />

      {nextAcademy && (
        <Card className="border-accent/40">
          <CardHeader>
            <CardTitle>Continue: {nextAcademy.title}</CardTitle>
            <CardDescription>
              {nextAcademy.passedLessons}/{nextAcademy.totalLessons} lessons complete
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/school/academy/${nextAcademy.slug}`} className="text-sm font-medium text-accent hover:underline">
              Continue learning →
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.academies.map((academy) => (
          <Card key={academy.id} className={!academy.unlocked ? "opacity-60" : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>
                  Academy {academy.number}: {academy.title}
                </CardTitle>
                {academy.complete ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-bull" />
                ) : !academy.unlocked ? (
                  <Lock className="h-4 w-4 shrink-0 text-muted" />
                ) : null}
              </div>
              <CardDescription>{academy.outcome}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-2">
              <Badge variant={academy.gateStatus === "required" ? "warn" : "muted"}>
                {academy.gateStatus === "required" ? "Required" : "Advisory"}
              </Badge>
              <span className="text-xs text-muted">
                {academy.passedLessons}/{academy.totalLessons} lessons
              </span>
              {academy.unlocked ? (
                <Link href={`/school/academy/${academy.slug}`} className="text-sm font-medium text-accent hover:underline">
                  Open
                </Link>
              ) : (
                <span className="text-xs text-muted">Locked</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Restricted from live trading?</CardTitle>
          <CardDescription>
            A 50% live-loss event requires the separate Live-Trading Risk Re-Certification program, available any time regardless of curriculum progress.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/school/recertification" className="text-sm font-medium text-accent hover:underline">
            Go to Live-Trading Risk Re-Certification →
          </Link>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/school/progress" className="text-accent hover:underline">
          Progress &amp; gate status
        </Link>
        <Link href="/school/labs" className="text-accent hover:underline">
          Labs
        </Link>
        <Link href="/school/resources" className="text-accent hover:underline">
          Resources
        </Link>
      </div>
    </div>
  );
}

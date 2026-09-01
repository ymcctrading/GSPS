"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SchoolDisclaimer } from "@/components/school/disclaimer";

interface LabEntry {
  academyTitle: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  scenarioBasis: string;
  status: "not_started" | "in_progress" | "submitted" | "passed" | "needs_revision";
  updatedAt: string | null;
}

type LoadState = "loading" | "unauthorized" | "error" | "empty" | "ready";

const STATUS_VARIANT: Record<LabEntry["status"], "bull" | "warn" | "muted"> = {
  passed: "bull",
  needs_revision: "warn",
  submitted: "warn",
  in_progress: "muted",
  not_started: "muted",
};

export function LabsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [labs, setLabs] = useState<LabEntry[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/school/curriculum/labs")
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) return setState("unauthorized");
        if (!res.ok) return setState("error");
        const json = await res.json();
        setLabs(json.labs);
        setState(json.labs.length === 0 ? "empty" : "ready");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") return <p className="text-sm text-muted">Loading labs…</p>;
  if (state === "unauthorized") return <p className="text-sm text-muted">Sign in to see your labs.</p>;
  if (state === "error") return <p className="text-sm text-bear">Couldn&apos;t load labs. Try refreshing.</p>;
  if (state === "empty") return <p className="text-sm text-muted">No labs are published yet.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Labs</h1>
        <p className="text-sm text-muted">Trade plans, research memos, chart annotations, and portfolio exercises using the Three-Element Method.</p>
      </div>
      <SchoolDisclaimer />
      <div className="grid gap-3 sm:grid-cols-2">
        {labs.map((lab) => (
          <Card key={lab.lessonId}>
            <CardHeader>
              <CardTitle>{lab.lessonTitle}</CardTitle>
              <CardDescription>
                {lab.academyTitle} · {lab.courseTitle}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-2">
              <Badge variant={STATUS_VARIANT[lab.status]}>{lab.status.replace("_", " ")}</Badge>
              <Link href={`/school/lesson/${lab.lessonId}`} className="text-sm font-medium text-accent hover:underline">
                Open →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

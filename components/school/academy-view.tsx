"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SchoolBreadcrumbs } from "@/components/school/breadcrumbs";

interface AcademyDetail {
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
  courses: { id: string; slug: string; title: string; lessonCount: number }[];
}

type LoadState = "loading" | "unauthorized" | "error" | "not_found" | "ready";

export function AcademyView({ academySlug }: { academySlug: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [academy, setAcademy] = useState<AcademyDetail | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/school/curriculum/map")
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) return setState("unauthorized");
        if (!res.ok) return setState("error");
        const json = await res.json();
        const found = (json.academies as AcademyDetail[]).find((a) => a.slug === academySlug);
        if (!found) return setState("not_found");
        setAcademy(found);
        setState("ready");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [academySlug]);

  if (state === "loading") return <p className="text-sm text-muted">Loading academy…</p>;
  if (state === "unauthorized") return <p className="text-sm text-muted">Sign in to view this academy.</p>;
  if (state === "error") return <p className="text-sm text-bear">Couldn&apos;t load this academy. Try refreshing.</p>;
  if (state === "not_found" || !academy) return <p className="text-sm text-muted">Academy not found.</p>;

  return (
    <div className="space-y-4">
      <SchoolBreadcrumbs trail={[{ label: `Academy ${academy.number}: ${academy.title}` }]} />
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">
            Academy {academy.number}: {academy.title}
          </h1>
          <Badge variant={academy.gateStatus === "required" ? "warn" : "muted"}>
            {academy.gateStatus === "required" ? "Required" : "Advisory"}
          </Badge>
        </div>
        <p className="text-sm text-muted">{academy.outcome}</p>
        <p className="mt-1 text-xs text-muted">
          {academy.passedLessons}/{academy.totalLessons} lessons complete
        </p>
      </div>

      {!academy.unlocked && (
        <Card className="border-warn/40">
          <CardContent className="pt-4 text-sm text-muted">Complete the prerequisite academies to unlock this one.</CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {academy.courses.map((course) => (
          <Card key={course.id}>
            <CardHeader>
              <CardTitle>{course.title}</CardTitle>
              <CardDescription>{course.lessonCount} lesson{course.lessonCount === 1 ? "" : "s"}</CardDescription>
            </CardHeader>
            <CardContent>
              {academy.unlocked ? (
                course.lessonCount > 0 ? (
                  <Link href={`/school/course/${course.slug}`} className="text-sm font-medium text-accent hover:underline">
                    Open course →
                  </Link>
                ) : (
                  <Link href="/school/recertification" className="text-sm font-medium text-accent hover:underline">
                    Go to Live-Trading Risk Re-Certification →
                  </Link>
                )
              ) : (
                <span className="text-xs text-muted">Locked</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

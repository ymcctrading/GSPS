"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Lock } from "lucide-react";
import { SchoolBreadcrumbs } from "@/components/school/breadcrumbs";

interface CourseDetail {
  academy: { id: string; slug: string; title: string; number: number; unlocked: boolean };
  course: {
    id: string;
    slug: string;
    title: string;
    outcome: string;
    lessons: { id: string; title: string; estimatedMinutes: number; passed: boolean; unlocked: boolean }[];
  };
}

type LoadState = "loading" | "unauthorized" | "error" | "not_found" | "ready";

export function CourseView({ courseSlug }: { courseSlug: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<CourseDetail | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/school/curriculum/course/${courseSlug}`)
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) return setState("unauthorized");
        if (res.status === 404) return setState("not_found");
        if (!res.ok) return setState("error");
        setData(await res.json());
        setState("ready");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [courseSlug]);

  if (state === "loading") return <p className="text-sm text-muted">Loading course…</p>;
  if (state === "unauthorized") return <p className="text-sm text-muted">Sign in to view this course.</p>;
  if (state === "error") return <p className="text-sm text-bear">Couldn&apos;t load this course. Try refreshing.</p>;
  if (state === "not_found" || !data) return <p className="text-sm text-muted">Course not found.</p>;

  const lessonPath = (id: string) => `/school/lesson/${id}`;

  return (
    <div className="space-y-4">
      <SchoolBreadcrumbs
        trail={[
          { label: `Academy ${data.academy.number}: ${data.academy.title}`, href: `/school/academy/${data.academy.slug}` },
          { label: data.course.title },
        ]}
      />
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">{data.course.title}</h1>
        <p className="text-sm text-muted">{data.course.outcome}</p>
      </div>

      {!data.academy.unlocked && (
        <Card className="border-warn/40">
          <CardContent className="pt-4 text-sm text-muted">Complete the prerequisite academies to unlock this course.</CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {data.course.lessons.map((lesson, i) => {
          const canOpen = data.academy.unlocked && lesson.unlocked;
          return (
            <Card key={lesson.id}>
              <CardContent className="flex items-center justify-between gap-3 pt-4">
                <div className="flex items-center gap-2 min-w-0">
                  {lesson.passed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-bull" />
                  ) : !canOpen ? (
                    <Lock className="h-4 w-4 shrink-0 text-muted" />
                  ) : (
                    <span className="w-4 shrink-0 text-center text-xs text-muted">{i + 1}</span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{lesson.title}</p>
                    <p className="text-xs text-muted">{lesson.estimatedMinutes} min</p>
                  </div>
                </div>
                {canOpen ? (
                  <Link href={lessonPath(lesson.id)} className="shrink-0 text-sm font-medium text-accent hover:underline">
                    {lesson.passed ? "Review" : "Start"}
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-muted">Locked</span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

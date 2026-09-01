"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { SchoolBreadcrumbs } from "@/components/school/breadcrumbs";
import { SchoolSubNav } from "@/components/school/sub-nav";
import { SchoolDisclaimer } from "@/components/school/disclaimer";
import { ProvenanceBadge, type Provenance } from "@/components/school/provenance-badge";
import { ThreeElementForm, type ThreeElementFormValue } from "@/components/school/three-element-form";

interface LessonDetail {
  academy: { id: string; slug: string; title: string };
  course: { id: string; slug: string; title: string };
  lesson: {
    id: string;
    title: string;
    objectives: string[];
    estimatedMinutes: number;
    instruction: string[];
    application: string;
    questions: { question: string; choices: string[] }[];
    bullBear: { required: true; requiresRegimeCheckpoint: boolean; scenarioBasis: "hypothetical" | "simulation" | "paper_trading" | "recorded_behavior" } | null;
    metricsShown: { label: string; provenance: Provenance }[] | null;
  };
  unlocked: boolean;
  progress: { status: "not_started" | "in_progress" | "passed"; attempt_count: number };
}

type LoadState = "loading" | "unauthorized" | "error" | "not_found" | "ready";

export function LessonPlayer({ lessonId }: { lessonId: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<LessonDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [labErrors, setLabErrors] = useState<readonly string[]>([]);
  const [submittingLab, setSubmittingLab] = useState(false);
  const [labPassed, setLabPassed] = useState(false);

  function load() {
    fetch(`/api/school/curriculum/lesson/${lessonId}`)
      .then(async (res) => {
        if (res.status === 401) return setState("unauthorized");
        if (res.status === 404) return setState("not_found");
        if (!res.ok) return setState("error");
        const json = (await res.json()) as LessonDetail;
        setData(json);
        setLabPassed(json.progress.status === "passed" && Boolean(json.lesson.bullBear));
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  async function submitQuiz() {
    if (!data) return;
    const ordered = data.lesson.questions.map((_, i) => answers[i]);
    const res = await fetch(`/api/school/curriculum/lesson/${lessonId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: ordered }),
    });
    const json = await res.json();
    if (!res.ok) {
      setQuizFeedback(json.error ?? "Could not submit.");
      return;
    }
    setQuizFeedback(json.passed ? "Passed — mastery recorded." : "Not yet — review the instruction and try again.");
    load();
  }

  async function submitLab(value: ThreeElementFormValue) {
    if (!data?.lesson.bullBear) return;
    setSubmittingLab(true);
    setLabErrors([]);
    try {
      const res = await fetch(`/api/school/curriculum/labs/${lessonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labType: "trade_plan", ...value }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLabErrors([json.error ?? "Could not submit."]);
        return;
      }
      if (!json.passed) {
        setLabErrors(json.errors ?? []);
        return;
      }
      setLabPassed(true);
    } finally {
      setSubmittingLab(false);
    }
  }

  if (state === "loading") return <p className="text-sm text-muted">Loading lesson…</p>;
  if (state === "unauthorized") return <p className="text-sm text-muted">Sign in to view this lesson.</p>;
  if (state === "error") return <p className="text-sm text-bear">Couldn&apos;t load this lesson. Try refreshing.</p>;
  if (state === "not_found" || !data) return <p className="text-sm text-muted">Lesson not found.</p>;

  if (!data.unlocked) {
    return (
      <div className="space-y-4">
        <SchoolBreadcrumbs
          trail={[
            { label: data.academy.title, href: `/school/academy/${data.academy.slug}` },
            { label: data.course.title, href: `/school/course/${data.course.slug}` },
            { label: data.lesson.title },
          ]}
        />
        <Card className="border-warn/40">
          <CardContent className="pt-4 text-sm text-muted">This lesson is locked until its prerequisite academies are complete.</CardContent>
        </Card>
        <SchoolSubNav />
      </div>
    );
  }

  const quizComplete = data.lesson.questions.length > 0 && Object.keys(answers).length === data.lesson.questions.length;
  const requiresBullBear = Boolean(data.lesson.bullBear);
  const lessonComplete = data.progress.status === "passed" && (!requiresBullBear || labPassed);

  return (
    <div className="space-y-5">
      <SchoolBreadcrumbs
        trail={[
          { label: data.academy.title, href: `/school/academy/${data.academy.slug}` },
          { label: data.course.title, href: `/school/course/${data.course.slug}` },
          { label: data.lesson.title },
        ]}
      />

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">{data.lesson.title}</h1>
          {lessonComplete && <CheckCircle2 className="h-5 w-5 text-bull" />}
        </div>
        <p className="text-xs text-muted">{data.lesson.estimatedMinutes} min</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Objectives</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="ml-4 list-disc space-y-1 text-sm">
            {data.lesson.objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <SchoolDisclaimer scenarioBasis={data.lesson.bullBear?.scenarioBasis} />

      <Card>
        <CardHeader>
          <CardTitle>Instruction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-foreground">
          {data.lesson.instruction.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </CardContent>
      </Card>

      {data.lesson.metricsShown && data.lesson.metricsShown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Metrics referenced in this lesson</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.lesson.metricsShown.map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <span>{m.label}</span>
                <ProvenanceBadge provenance={m.provenance} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Application</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">{data.lesson.application}</CardContent>
      </Card>

      {data.lesson.questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Mastery Check</CardTitle>
            <CardDescription>Every question must be answered correctly to pass. Partial progress does not grant completion.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.lesson.questions.map((q, qi) => (
              <div key={qi} className="space-y-1">
                <p className="text-sm font-medium">{q.question}</p>
                <div className="flex flex-col gap-1">
                  {q.choices.map((choice, ci) => (
                    <label key={ci} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`q-${qi}`}
                        checked={answers[qi] === ci}
                        onChange={() => setAnswers((a) => ({ ...a, [qi]: ci }))}
                      />
                      {choice}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <Button onClick={submitQuiz} disabled={!quizComplete}>
              Submit quiz
            </Button>
            {quizFeedback && <p className="text-sm text-muted">{quizFeedback}</p>}
          </CardContent>
        </Card>
      )}

      {data.lesson.bullBear && !labPassed && (
        <ThreeElementForm
          requiresRegimeCheckpoint={data.lesson.bullBear.requiresRegimeCheckpoint}
          onSubmit={submitLab}
          submitting={submittingLab}
          errors={labErrors}
        />
      )}
      {data.lesson.bullBear && labPassed && (
        <Card className="border-bull/40">
          <CardContent className="pt-4 text-sm text-bull">Three-Element activity submitted and passed.</CardContent>
        </Card>
      )}

      <div className="flex justify-between text-sm">
        <Link href={`/school/course/${data.course.slug}`} className="text-accent hover:underline">
          ← Back to course
        </Link>
      </div>

      <SchoolSubNav />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LessonView {
  id: string;
  title: string;
  objectives: string[];
  prerequisites: string[];
  instruction: string[];
  application: string;
  questions: { question: string; choices: string[] }[];
  progress: { status: string; attempt_count: number };
}

interface ProgressSummary {
  totalLessons: number;
  passedLessons: number;
  complete: boolean;
}

export function SchoolFlow() {
  const [lessons, setLessons] = useState<LessonView[] | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/school/progress");
    if (!res.ok) return;
    const data = await res.json();
    setLessons(data.lessons);
    setProgress(data.progress);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/school/progress");
      if (!res.ok || !active) return;
      const data = await res.json();
      if (!active) return;
      setLessons(data.lessons);
      setProgress(data.progress);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!lessons || !progress) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const unmetPrereqs = (lesson: LessonView) =>
    lesson.prerequisites.filter((id) => lessons.find((l) => l.id === id)?.progress.status !== "passed");

  async function submitQuiz(lesson: LessonView) {
    setSubmitting(true);
    setFeedback(null);
    const ordered = lesson.questions.map((_, i) => answers[i] ?? -1);
    const res = await fetch(`/api/school/lessons/${lesson.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: ordered }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setFeedback(data.error ?? "Something went wrong.");
      return;
    }
    setFeedback(
      data.passed
        ? data.reverified
          ? "Passed — program complete. Live trading is re-enabled."
          : "Passed."
        : "Not quite — review the lesson and try again.",
    );
    setAnswers({});
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>
            {progress.passedLessons}/{progress.totalLessons} lessons passed
            {progress.complete ? " — program complete." : ""}
          </CardDescription>
        </CardHeader>
      </Card>

      {lessons.map((lesson) => {
        const passed = lesson.progress.status === "passed";
        const locked = !passed && unmetPrereqs(lesson).length > 0;
        const isOpen = openLessonId === lesson.id;
        return (
          <Card key={lesson.id} className={cn(locked && "opacity-60")}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>{lesson.title}</span>
                <span className="text-xs font-normal text-muted">
                  {passed ? "Passed" : locked ? "Locked" : "Not started"}
                </span>
              </CardTitle>
              <CardDescription>{lesson.objectives.join(" ")}</CardDescription>
            </CardHeader>
            {!locked && (
              <CardContent className="flex flex-col gap-3">
                {!isOpen && (
                  <Button variant="outline" onClick={() => setOpenLessonId(lesson.id)}>
                    {passed ? "Review" : "Start"}
                  </Button>
                )}
                {isOpen && (
                  <div className="flex flex-col gap-4">
                    {lesson.instruction.map((p, i) => (
                      <p key={i} className="text-sm">
                        {p}
                      </p>
                    ))}
                    <p className="text-sm italic text-muted">{lesson.application}</p>
                    <div className="flex flex-col gap-4">
                      {lesson.questions.map((q, qi) => (
                        <div key={qi} className="flex flex-col gap-2">
                          <p className="text-sm font-medium">{q.question}</p>
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
                      ))}
                    </div>
                    {feedback && <p className="text-sm">{feedback}</p>}
                    <div className="flex gap-2">
                      <Button
                        disabled={submitting || Object.keys(answers).length !== lesson.questions.length}
                        onClick={() => submitQuiz(lesson)}
                      >
                        Submit
                      </Button>
                      <Button variant="outline" onClick={() => setOpenLessonId(null)}>
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

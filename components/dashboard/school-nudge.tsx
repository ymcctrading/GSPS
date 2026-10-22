import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlatformTier } from "@/lib/tiers";

/**
 * The Dashboard's nudge toward GSPS School for Novice and Pro (owner,
 * 2026-10-22: "nudge novice and pro users to check out the school"). It names
 * the learner's next academy and the graduation exam for their step up, so the
 * curriculum path to the next tier is one tap away from the screen they open
 * first. Expert and Wall Street see nothing here: their School work is the
 * capstone, which the promotion page already names.
 *
 * Three questions: (1) the first of Gann's five qualifications for a trader is
 * knowledge, from regular study over years (taught in Academy 6, "The
 * Trader's Five Qualifications"), so the screen a learner opens first points
 * to the study. (2) No
 * periodicity claim. (3) Polarity: the novice pole gets its own way in, the
 * study, rather than a shorter copy of the expert's dashboard. Law of
 * Creation: lesson ⊗ practice account; the third is the learner who reads the
 * plan they just studied on a live chart.
 */
export interface SchoolNudgeData {
  tier: Extract<PlatformTier, "PRACTICE" | "STANDARD">;
  next: { title: string; slug: string; passedLessons: number; totalLessons: number } | null;
  /** A practice account previews School; it keeps no progress of its own. */
  practice: boolean;
}

const STEP = {
  PRACTICE: { label: "Novice", up: "Pro", exam: "/school/exam/novice_to_pro" },
  STANDARD: { label: "Pro", up: "Expert", exam: "/school/exam/pro_to_expert" },
} as const;

export function SchoolNudge({ data }: { data: SchoolNudgeData }) {
  const step = STEP[data.tier];
  return (
    <Card className="border-accent/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-accent" /> GSPS School
        </CardTitle>
        <CardDescription>
          {data.practice
            ? `Every lesson is open to read from this practice account. Create your own account to keep your progress and take the ${step.label} to ${step.up} exam.`
            : `The courses and the ${step.label} to ${step.up} exam are one way to move up to ${step.up}, alongside your track record.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {data.next ? (
          <Link href={`/school/academy/${data.next.slug}`} className="font-medium text-accent hover:underline">
            {data.next.passedLessons > 0 ? "Continue" : "Start"}: {data.next.title} ({data.next.passedLessons}/
            {data.next.totalLessons} lessons) →
          </Link>
        ) : (
          <Link href="/school" className="font-medium text-accent hover:underline">
            Open School →
          </Link>
        )}
        <Link href={step.exam} className="text-muted hover:text-accent hover:underline">
          {step.label} to {step.up} graduation exam
        </Link>
      </CardContent>
    </Card>
  );
}

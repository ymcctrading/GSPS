/**
 * GSPS School — pilot program content.
 *
 * Per `docs/GSPS_SCHOOL.md`, this repo has no approved curriculum
 * specification, learner audience, or subject list beyond one concrete,
 * already-coded need: `live_trading_restrictions.school_completed_at`
 * (`lib/risk/live-trade-loss.ts`) has existed since migration 0052 as a
 * policy hook with no writer — a restricted account had no path to lift a
 * 50%-loss-event restriction. This module is the one pilot program in
 * scope: re-certifying a restricted member on the GSPS rules that produced
 * the restriction, using only rules this codebase already implements and
 * enforces elsewhere. It is not a stand-in for the broader GSPS School
 * product described in the curriculum handoff — see that doc's "Not yet
 * verified" table for everything this pilot deliberately doesn't answer.
 *
 * Content lives as versioned code rather than database rows, matching this
 * repo's existing precedent (`lib/education/patterns.ts`) for plain-
 * language explanatory content — a CMS/admin authoring pipeline is future
 * scope the curriculum handoff itself sequences after a pilot module, not
 * before it.
 */

export interface QuizQuestion {
  question: string;
  choices: readonly string[];
  correctIndex: number;
}

export interface SchoolLesson {
  id: string;
  title: string;
  /** 1-3 observable learning objectives, in learner language. */
  objectives: readonly string[];
  /** Required prior lesson ids. */
  prerequisites: readonly string[];
  /** Core explanation — short paragraphs, plain language. */
  instruction: readonly string[];
  /** The practice/decision exercise the learner works through. */
  application: string;
  /** Mastery check — every question must be answered correctly to pass. */
  quiz: readonly QuizQuestion[];
  reviewMeta: {
    author: string;
    lastReviewedAt: string;
    status: "draft" | "in_review" | "approved" | "published" | "archived";
  };
}

export const LIVE_TRADING_RECERTIFICATION_PROGRAM_ID = "live-trading-recertification";

export const LIVE_TRADING_RECERTIFICATION_LESSONS: readonly SchoolLesson[] = [
  {
    id: "why-you-are-here",
    title: "Why this account was restricted",
    objectives: [
      "State the loss threshold that triggers a live-trading restriction.",
      "Explain why the restriction applies only to live trading, not paper.",
    ],
    prerequisites: [],
    instruction: [
      "A live position that reaches a 50% loss of the funds allocated to that trade triggers three things at once, automatically: any live automation profile tied to that symbol is paused, the position is flattened (closing orders included), and your account is restricted from opening new live trades.",
      "This is a live-only rule. Nothing about it touches paper trading — a paper account can lose 50%, 100%, or more on a position with no restriction, because paper trading exists precisely so mistakes cost nothing.",
      "Completing this program is how a restricted account demonstrates it understands why the restriction fired, and resumes live trading with that understanding refreshed — not as a formality.",
    ],
    application:
      "Before continuing, locate the position that triggered your restriction in your trade history and note its allocated risk and exit price.",
    quiz: [
      {
        question: "A live-trading restriction fires at what loss threshold, measured against a trade's allocated funds?",
        choices: ["9%", "30%", "50%", "It has no fixed threshold"],
        correctIndex: 2,
      },
      {
        question: "Does the same restriction ever apply to a paper account?",
        choices: ["Yes, identically", "No — it is live-only", "Only above Wall Street tier", "Only for options"],
        correctIndex: 1,
      },
    ],
    reviewMeta: { author: "GSPS", lastReviewedAt: "2026-09-01", status: "published" },
  },
  {
    id: "the-loss-cascade",
    title: "The full loss-notification cascade",
    objectives: [
      "List the notification thresholds below the 50% force-close level.",
      "Explain what happens differently at 30% versus the earlier thresholds.",
    ],
    prerequisites: ["why-you-are-here"],
    instruction: [
      "Every live position is monitored against the same allocated-funds loss percentage. At 6%, 9%, and 15%, GSPS sends one notification per threshold, per trade — never repeated once you've been notified for that threshold on that trade.",
      "At 30%, the same notification fires but is treated as a hard warning rather than a routine one, regardless of your membership tier.",
      "None of these thresholds pause or close anything by themselves. Only 50% does that. The earlier thresholds exist so a loss is never a surprise by the time it forces a close.",
    ],
    application:
      "If a live trade were losing money, name the first dollar-percentage point at which you would expect to hear from GSPS about it.",
    quiz: [
      {
        question: "How many separate notification thresholds exist below the 50% force-close level?",
        choices: ["One", "Two", "Four", "Notifications only start at 50%"],
        correctIndex: 2,
      },
      {
        question: "What is different about the 30% threshold compared to 6%/9%/15%?",
        choices: [
          "It closes the position automatically",
          "It's treated as a hard warning, though nothing is closed yet",
          "It only applies to Wall Street tier",
          "It pauses automation but not the position",
        ],
        correctIndex: 1,
      },
    ],
    reviewMeta: { author: "GSPS", lastReviewedAt: "2026-09-01", status: "published" },
  },
  {
    id: "stop-discipline",
    title: "Why widening or removing a live stop is deliberately hard",
    objectives: [
      "Describe the two-step friction required to widen or remove a live stop.",
      "Explain why that friction exists.",
    ],
    prerequisites: ["why-you-are-here"],
    instruction: [
      "On a live position, widening or removing your stop-loss is not a single click. You must first acknowledge a high-friction warning, then confirm through a verified-email link sent to your account email before the change takes effect.",
      "This exists because a stop being moved further away, or removed entirely, is one of the most common ways a manageable loss becomes an unmanageable one. Requiring a deliberate, delayed confirmation step is meant to interrupt an in-the-moment decision made while a position is already moving against you.",
      "The verification link expires after 30 minutes. If it expires, you request the override again — the friction is intentional, not a bug.",
    ],
    application: "Recall a time you wanted to move a stop further away while a trade was losing. What would 30 minutes of delay have changed?",
    quiz: [
      {
        question: "What must happen before a requested live stop-loss widen or removal takes effect?",
        choices: [
          "Nothing — it applies immediately",
          "A single confirmation checkbox",
          "Acknowledging a warning, then confirming via a verified-email link",
          "A phone call to support",
        ],
        correctIndex: 2,
      },
      {
        question: "How long is the verification link valid for?",
        choices: ["5 minutes", "30 minutes", "24 hours", "It never expires"],
        correctIndex: 1,
      },
    ],
    reviewMeta: { author: "GSPS", lastReviewedAt: "2026-09-01", status: "published" },
  },
  {
    id: "resuming-live-trading",
    title: "What changes when you resume",
    objectives: [
      "State what this program's completion does, and does not, do to your account.",
    ],
    prerequisites: ["the-loss-cascade", "stop-discipline"],
    instruction: [
      "Completing every lesson and quiz in this program lifts the live-trading restriction on your account. It does not change the rules above — the same 6/9/15/30/50% cascade and the same stop-override friction apply to your next live trade exactly as they did before the restriction.",
      "A future 50% loss event restricts the account again, the same way, and requires completing this program again before live trading resumes.",
    ],
    application: "Before resuming, decide one concrete change to your position sizing or stop placement that would keep a future loss further from 50% of allocated funds.",
    quiz: [
      {
        question: "Does completing this program change the loss-cascade thresholds for your account?",
        choices: ["Yes, they reset to zero", "No — the same thresholds apply to every future live trade", "Only the 50% threshold changes", "It removes the stop-override friction"],
        correctIndex: 1,
      },
    ],
    reviewMeta: { author: "GSPS", lastReviewedAt: "2026-09-01", status: "published" },
  },
];

export interface LessonValidationResult {
  publishable: boolean;
  errors: readonly string[];
}

/** Blocks publication when a lesson is missing any required content standard. */
export function validateLessonPublishable(lesson: SchoolLesson): LessonValidationResult {
  const errors: string[] = [];
  if (lesson.objectives.length < 1 || lesson.objectives.length > 3) {
    errors.push("objectives: must have 1-3 learning objectives");
  }
  if (lesson.instruction.length === 0) {
    errors.push("instruction: must not be empty");
  }
  if (!lesson.application.trim()) {
    errors.push("application: must not be empty");
  }
  if (lesson.quiz.length === 0) {
    errors.push("quiz: at least one mastery-check question is required");
  }
  for (const q of lesson.quiz) {
    if (q.correctIndex < 0 || q.correctIndex >= q.choices.length) {
      errors.push(`quiz: "${q.question}" has an out-of-range correctIndex`);
    }
  }
  if (!lesson.reviewMeta.author || !lesson.reviewMeta.lastReviewedAt) {
    errors.push("reviewMeta: author and lastReviewedAt are required");
  }
  if (lesson.reviewMeta.status !== "published") {
    errors.push(`reviewMeta.status: "${lesson.reviewMeta.status}" is not publishable`);
  }
  return { publishable: errors.length === 0, errors };
}

export function getPublishedLessons(): readonly SchoolLesson[] {
  return LIVE_TRADING_RECERTIFICATION_LESSONS.filter((l) => validateLessonPublishable(l).publishable);
}

export function getLesson(lessonId: string): SchoolLesson | undefined {
  return LIVE_TRADING_RECERTIFICATION_LESSONS.find((l) => l.id === lessonId);
}

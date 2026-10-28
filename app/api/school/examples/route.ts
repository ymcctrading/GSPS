/**
 * GSPS — /api/school/examples?lesson=<lesson id>
 *
 * The live examples a lesson draws from the learner's own charts
 * (lib/school/examples.ts, lib/school/lessonExamples.ts): for each example
 * the lesson asks for, the most recent one among the learner's markets, or
 * SPY's labelled as a stand-in. Completed daily bars only; past moves, never a
 * forecast.
 *
 * GET -> { needsPicks: true } when the learner hasn't picked yet, else
 *        { examples: [{ kind, title, symbol, standIn, caption, bars, points, lines } | { kind, title, none: true }], noCharts, shortHistory }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readSchoolPicks } from "@/lib/school/picks";
import { examplesForLesson } from "@/lib/school/lessonExamples";
import { loadLessonExamples } from "@/lib/school/exampleData";
import { EXAMPLE_TITLES } from "@/lib/school/examples";

export async function GET(req: NextRequest) {
  const lessonId = req.nextUrl.searchParams.get("lesson") ?? "";
  const kinds = examplesForLesson(lessonId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("settings").select("prefs").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Couldn't read your settings." }, { status: 502 });
  const picks = readSchoolPicks((data as { prefs?: Record<string, unknown> } | null)?.prefs ?? null);
  if (!picks) return NextResponse.json({ needsPicks: true, examples: [] });
  if (kinds.length === 0) return NextResponse.json({ needsPicks: false, examples: [], noCharts: [], shortHistory: [] });

  const result = await loadLessonExamples(picks.symbols, kinds);
  return NextResponse.json({
    needsPicks: false,
    noCharts: result.noCharts,
    shortHistory: result.shortHistory,
    examples: result.examples.map(({ kind, example }) =>
      example
        ? {
            kind,
            title: EXAMPLE_TITLES[kind],
            symbol: example.symbol,
            standIn: example.standIn,
            caption: example.match.caption,
            bars: example.bars,
            points: example.match.points,
            lines: example.match.lines,
          }
        : { kind, title: EXAMPLE_TITLES[kind], none: true },
    ),
  });
}

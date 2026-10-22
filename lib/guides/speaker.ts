/**
 * Mr. Bull and Mrs. Bear, the learner's two named guides (AGENTS.md Stage E,
 * `docs/GSPS_BRAND_GUIDE.md`), and how a line of lesson text is assigned to
 * one of them.
 *
 * Design basis (AGENTS.md's mandate):
 * 1. Gann. No Gann source applies: this is how the platform's own teaching
 *    voices are drawn, not a market rule.
 * 2. Cycles. No periodicity or recurrence claim, so Dewey's checklist does
 *    not apply.
 * 3. Hermetic. Polarity first: the two guides are equals and opposites, the
 *    case for the trade and the challenge to it, so they carry equal visual
 *    weight and neither colour is ever borrowed by the other (Chuck's art
 *    direction, 2026-10-22). Gender too: a masculine and a feminine voice whose
 *    joint work produces the decision. Correspondence, Rhythm, Vibration,
 *    Mentalism and Cause and Effect don't shape a speaker label.
 * Law of Creation: Bull ⊗ Bear. Shown apart they are two opinions; joined in
 * one paired tip they create the decision neither gives alone, which re-enters
 * as the learner's own trade plan. The paired tip is that third.
 */

export type GuideId = "bull" | "bear";
export type GuideSpeaker = GuideId | "both";

export const GUIDE_NAMES: Record<GuideId, string> = {
  bull: "Mr. Bull",
  bear: "Mrs. Bear",
};

/** What each guide stands for, read by a screen reader with the name. */
export const GUIDE_ROLES: Record<GuideId, string> = {
  bull: "makes the case for the trade",
  bear: "challenges it and guards the risk",
};

/**
 * The guide a line of lesson text is spoken by, read from how the line opens
 * ("Mr. Bull's rule: …", "Mrs. Bear's warning: …", "Mr. Bull and Mrs. Bear
 * are …"). A line that only mentions a guide later on is not theirs.
 */
export function speakerOf(text: string): GuideSpeaker | null {
  const t = text.trimStart();
  if (/^(Mr\. Bull and Mrs\. Bear|Mrs\. Bear and Mr\. Bull)\b/.test(t)) return "both";
  if (/^Mr\. Bull\b/.test(t)) return "bull";
  if (/^Mrs\. Bear\b/.test(t)) return "bear";
  return null;
}

/**
 * GSPS — Mrs. Bull and Mr. Bear.
 *
 * Drawn here as inline SVG rather than shipped as image files, for the same
 * reasons the tour's figures are: no extra request, no CSP exception, crisp at
 * any size, and every colour is a theme token so both characters follow light
 * and dark without a second asset.
 *
 * ## Why two of them, and why these two
 *
 * A bull market rises and a bear market falls. That is vocabulary a beginner
 * will meet on every finance site they ever visit, and it is usually explained
 * in a glossary entry they will not read. Here it is taught by who turns up:
 * Mrs. Bull brings the opportunities, Mr. Bear brings the warnings. By the time
 * a reader has been through the tour they have met the distinction a dozen
 * times without being made to memorise anything.
 *
 * So the pairing is not decoration — the split carries the lesson. Which is
 * also why `lib/onboarding/mascot.ts` assigns a speaker per step by subject
 * matter rather than alternating them, and why a test asserts the risk steps
 * belong to Mr. Bear.
 *
 * ## On the drawing
 *
 * These are simple geometric characters — circles, arcs, and a horn or an ear —
 * not illustrated cartoons. That is an honest limit of drawing in SVG by hand
 * rather than a style statement. Every path is grouped and the palette is
 * driven by `currentColor` plus two tokens, so an illustrator can replace the
 * innards of `BullFace`/`BearFace` without touching anything that positions or
 * sizes them.
 */

import { cn } from "@/lib/utils";

export type MascotName = "bull" | "bear";

/** How each one is introduced and referred to in copy. */
export const MASCOTS: Record<MascotName, { label: string; role: string }> = {
  bull: {
    label: "Mrs. Bull",
    role: "Talks about opportunities and the upside — a bull market is one going up.",
  },
  bear: {
    label: "Mr. Bear",
    role: "Talks about risk and protecting your money — a bear market is one going down.",
  },
};

const SIZES = { sm: "h-9 w-9", md: "h-14 w-14", lg: "h-20 w-20" } as const;

export function Mascot({
  name,
  size = "md",
  className,
}: {
  name: MascotName;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const bull = name === "bull";
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn(SIZES[size], "shrink-0", bull ? "text-bull" : "text-bear", className)}
      role="img"
      aria-label={MASCOTS[name].label}
    >
      {/* A soft disc behind the head, so the character reads as a portrait
          against any surface rather than floating shapes. */}
      <circle cx="32" cy="32" r="31" className={bull ? "fill-bull/10" : "fill-bear/10"} />
      {bull ? <BullFace /> : <BearFace />}
    </svg>
  );
}

/**
 * Mrs. Bull: horns out and up, ears low and wide, a calm face.
 *
 * The horns sweep upward on purpose — the silhouette should read "up" at
 * 36 pixels, since that is the size the tour renders her at and the only
 * cue a reader gets at a glance.
 */
function BullFace() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* Horns.
          Filled crescents rather than open strokes: a stroked arc at this size
          reads as a leaf, which is what the first draft looked like. A shape
          thick at the base and tapering to a point is unmistakably a horn, and
          it is the silhouette doing the work at 36px, not the detail. */}
      <path
        d="M20 24c-5-1-9-5-9-10 4-1 9 2 12 7z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M44 24c5-1 9-5 9-10-4-1-9 2-12 7z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Ears, tucked under the horns so the two do not compete. */}
      <path d="M18 32c-4 0-6 2-7 4 3 1 5 1 8 0" strokeWidth="2.5" />
      <path d="M46 32c4 0 6 2 7 4-3 1-5 1-8 0" strokeWidth="2.5" />
      {/* Head */}
      <path
        d="M32 18c8 0 14 5 14 13 0 9-6 16-14 16s-14-7-14-16c0-8 6-13 14-13z"
        strokeWidth="3"
        className="fill-surface"
      />
      {/* Muzzle */}
      <path d="M25 39c0-4 3-6 7-6s7 2 7 6-3 6-7 6-7-2-7-6z" strokeWidth="2.5" />
      <circle cx="29" cy="39" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="35" cy="39" r="1.2" fill="currentColor" stroke="none" />
      {/* Eyes */}
      <circle cx="26" cy="29" r="2" fill="currentColor" stroke="none" />
      <circle cx="38" cy="29" r="2" fill="currentColor" stroke="none" />
    </g>
  );
}

/**
 * Mr. Bear: round ears high, heavier brow, a squarer muzzle.
 *
 * Deliberately rounder and lower than the bull — the two have to be tellable
 * apart in a glance at 36 pixels, and colour alone cannot carry that for a
 * reader who cannot distinguish red from green.
 */
function BearFace() {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      {/* Ears */}
      <circle cx="18" cy="21" r="6" strokeWidth="3" className="fill-surface" />
      <circle cx="46" cy="21" r="6" strokeWidth="3" className="fill-surface" />
      {/* Head */}
      <path
        d="M32 20c9 0 15 6 15 14s-6 14-15 14-15-6-15-14 6-14 15-14z"
        strokeWidth="3"
        className="fill-surface"
      />
      {/* Brow — the whole reason he reads as the cautious one. */}
      <path d="M23 28c2-1.5 4-1.5 6 0" strokeWidth="2.5" />
      <path d="M35 28c2-1.5 4-1.5 6 0" strokeWidth="2.5" />
      {/* Eyes */}
      <circle cx="26" cy="32" r="2" fill="currentColor" stroke="none" />
      <circle cx="38" cy="32" r="2" fill="currentColor" stroke="none" />
      {/* Muzzle */}
      <path d="M26 40c0-3 3-5 6-5s6 2 6 5-3 5-6 5-6-2-6-5z" strokeWidth="2.5" />
      <path d="M32 39v3" strokeWidth="2" />
      <ellipse cx="32" cy="38" rx="2.4" ry="1.6" fill="currentColor" stroke="none" />
    </g>
  );
}

/**
 * Both characters side by side, with what each one covers.
 *
 * Rendered only on the step that introduces them. The step names Mr. Bear in
 * its copy while Mrs. Bull is the one in the header, so without this the
 * reader is told about a character they have not seen — and the whole point of
 * the pairing is that it is recognisable on sight.
 */
export function MascotPair() {
  return (
    // Stacked, never two-up. The overlay card is a fixed ~360px regardless of
    // viewport, so a `xs:grid-cols-2` breakpoint — which reads the *viewport* —
    // put two columns inside a narrow card on a desktop screen and wrapped the
    // roles to one word per line.
    <div className="flex flex-col gap-2">
      {(["bull", "bear"] as const).map((name) => (
        <div
          key={name}
          className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
        >
          <Mascot name={name} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{MASCOTS[name].label}</p>
            <p className="text-xs leading-relaxed text-muted">{MASCOTS[name].role}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

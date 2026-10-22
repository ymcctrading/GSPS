/**
 * The <GuideAvatar/> layer: every picture of Mr. Bull and Mrs. Bear, and every
 * tip in their voice, is drawn here and nowhere else, so approved art replaces
 * the placeholders below in one place (Chuck's art direction, 2026-10-22,
 * /mnt/project-files/design/guide-avatar-art-direction.md). Design basis:
 * `lib/guides/speaker.ts`.
 *
 * The rules this layer holds, from that direction:
 * - Bull is green and Bear is red in every state, through the --guide-bull and
 *   --guide-bear tokens (app/globals.css, light and dark, AA contrast).
 * - Nothing green, teal or olive is drawn on or near Mrs. Bear: her artwork,
 *   ring, bubble and border use her red, navy, warm gray and charcoal only.
 * - Colour is never the only cue: every tip names its speaker and carries an
 *   icon (a rising line for Bull, a shield for Bear).
 * - Flat vector on deep navy, warm gray and soft gold supporting; no emoji.
 *
 * The SVGs are placeholders (simple shapes in the right palette), not the
 * finished characters. Swap `BullArt` and `BearArt` for the approved files.
 */

import { useId, type ReactNode } from "react";
import { ShieldAlert, TrendingUp } from "lucide-react";
import { GUIDE_NAMES, GUIDE_ROLES, type GuideId, type GuideSpeaker } from "@/lib/guides/speaker";

const SIZES = { sm: 28, md: 40, lg: 64 } as const;

/** Placeholder: a bull's head in a white open collar and an emerald vest. */
function BullArt() {
  return (
    <>
      <path d="M14 50 L32 40 L50 50 L50 64 L14 64 Z" fill="var(--guide-bull)" />
      <path d="M26 42 L32 52 L38 42 Z" fill="#ffffff" />
      <path d="M17 20 Q12 10 20 8 Q18 14 24 18 Z" fill="#f5f5f4" />
      <path d="M47 20 Q52 10 44 8 Q46 14 40 18 Z" fill="#f5f5f4" />
      <ellipse cx="32" cy="27" rx="13" ry="14" fill="var(--guide-warm-gray)" />
      <ellipse cx="32" cy="35" rx="8" ry="5" fill="#d6d3d1" />
      <circle cx="27" cy="24" r="1.8" fill="var(--guide-navy)" />
      <circle cx="37" cy="24" r="1.8" fill="var(--guide-navy)" />
    </>
  );
}

/** Placeholder: a bear's head in reading glasses, a charcoal blazer and a crimson scarf. */
function BearArt() {
  return (
    <>
      <path d="M14 50 L32 42 L50 50 L50 64 L14 64 Z" fill="#374151" />
      <path d="M22 44 Q32 52 42 44 L40 49 Q32 55 24 49 Z" fill="var(--guide-bear)" />
      <path d="M43 54 L47 54 L46 57 L43 57 Z" fill="var(--guide-bear)" />
      <circle cx="21" cy="15" r="5" fill="var(--guide-warm-gray)" />
      <circle cx="43" cy="15" r="5" fill="var(--guide-warm-gray)" />
      <circle cx="32" cy="27" r="14" fill="var(--guide-warm-gray)" />
      <ellipse cx="32" cy="33" rx="6" ry="4.5" fill="#d6d3d1" />
      <circle cx="32" cy="31" r="1.6" fill="var(--guide-navy)" />
      <circle cx="27" cy="24" r="3.4" fill="none" stroke="var(--guide-navy)" strokeWidth="1.2" />
      <circle cx="37" cy="24" r="3.4" fill="none" stroke="var(--guide-navy)" strokeWidth="1.2" />
      <path d="M30.4 24 L33.6 24" stroke="var(--guide-navy)" strokeWidth="1.2" />
    </>
  );
}

export function GuideAvatar({
  guide,
  size = "md",
  decorative = false,
}: {
  guide: GuideId;
  size?: keyof typeof SIZES;
  /** True where the speaker's name is already written beside the picture. */
  decorative?: boolean;
}) {
  const px = SIZES[size];
  const clipId = `guide-clip-${useId()}`;
  const ring = guide === "bull" ? "var(--guide-bull)" : "var(--guide-bear)";
  return (
    <svg
      viewBox="0 0 64 64"
      width={px}
      height={px}
      className="shrink-0"
      data-guide={guide}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : `${GUIDE_NAMES[guide]}, who ${GUIDE_ROLES[guide]}`}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="30" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="30" fill="var(--guide-navy)" />
      <g clipPath={`url(#${clipId})`}>{guide === "bull" ? <BullArt /> : <BearArt />}</g>
      <circle cx="32" cy="32" r="30" fill="none" stroke={ring} strokeWidth="3" />
    </svg>
  );
}

/** The guide's icon, the cue that doesn't rely on colour. */
export function GuideIcon({ guide, className = "h-3.5 w-3.5" }: { guide: GuideId; className?: string }) {
  const Icon = guide === "bull" ? TrendingUp : ShieldAlert;
  return <Icon className={className} aria-hidden="true" />;
}

function SpeakerLabel({ guide }: { guide: GuideId }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${guide === "bull" ? "text-guide-bull" : "text-guide-bear"}`}
    >
      <GuideIcon guide={guide} />
      {GUIDE_NAMES[guide]}
    </span>
  );
}

/**
 * A line of teaching in a guide's voice. A single guide's tip takes their
 * colour on its border and tint; a paired tip ("both") is split, green on the
 * left half and red on the right, with each guide's name and icon on its own
 * side, so Mrs. Bear's half never touches green.
 */
export function GuideTip({ speaker, children }: { speaker: GuideSpeaker; children: ReactNode }) {
  if (speaker === "both") {
    return (
      <div
        className="overflow-hidden rounded-md border border-border bg-surface"
        data-guide-tip="both"
        role="note"
        aria-label={`${GUIDE_NAMES.bull} and ${GUIDE_NAMES.bear}`}
      >
        <div className="flex h-1" aria-hidden="true">
          <span className="w-1/2 bg-guide-bull" />
          <span className="w-1/2 bg-guide-bear" />
        </div>
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <span className="flex items-center gap-2">
            <GuideAvatar guide="bull" size="sm" decorative />
            <SpeakerLabel guide="bull" />
          </span>
          <span className="flex items-center gap-2">
            <SpeakerLabel guide="bear" />
            <GuideAvatar guide="bear" size="sm" decorative />
          </span>
        </div>
        <div className="px-3 pb-3 pt-2">{children}</div>
      </div>
    );
  }
  const tone =
    speaker === "bull"
      ? "border-l-guide-bull bg-guide-bull-soft"
      : "border-l-guide-bear bg-guide-bear-soft";
  return (
    <div
      className={`flex gap-3 rounded-md border border-border border-l-4 p-3 ${tone}`}
      data-guide-tip={speaker}
      role="note"
      aria-label={GUIDE_NAMES[speaker]}
    >
      <GuideAvatar guide={speaker} size="md" decorative />
      <div className="min-w-0 space-y-1">
        <SpeakerLabel guide={speaker} />
        <div>{children}</div>
      </div>
    </div>
  );
}

/** The two guides side by side at equal size, for a page that introduces them together. */
export function GuidePair({ size = "md" }: { size?: keyof typeof SIZES }) {
  return (
    <span className="inline-flex items-center gap-2" role="img" aria-label={`${GUIDE_NAMES.bull} and ${GUIDE_NAMES.bear}`}>
      <GuideAvatar guide="bull" size={size} decorative />
      <GuideAvatar guide="bear" size={size} decorative />
    </span>
  );
}

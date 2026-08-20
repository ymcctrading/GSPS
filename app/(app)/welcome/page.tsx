/**
 * GSPS — /welcome
 *
 * The tour, as a page you can come back to.
 *
 * The overlay is the right shape for a first visit — it points at real things
 * on the real screen — and the wrong shape for a refresher, where someone wants
 * one specific answer ("which list do rejected orders go in?") and needs to
 * skim rather than click Next eleven times. So the same steps render here as
 * numbered sections with their own anchors, and the overlay is one button away
 * for anyone who does want the guided version again.
 *
 * The copy is not duplicated: both surfaces read `TOUR_STEPS`. That is the
 * whole reason the steps live in `lib/onboarding/tour.ts` as data rather than
 * as JSX inside the overlay.
 */

import Link from "next/link";
import { Compass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SnapshotDisclosure, SnapshotFigure } from "@/components/onboarding/snapshot-figure";
import { StartTourButton } from "@/components/onboarding/tour-provider";
import { TOUR_STEPS, stepLink } from "@/lib/onboarding/tour";
import { Mascot, MascotPair, MASCOTS } from "@/components/onboarding/mascots";
import { speakerFor } from "@/lib/onboarding/mascot";

export const metadata = { title: "Getting started — GSPS" };

export default function WelcomePage() {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Getting started</h1>
        <p className="text-sm text-muted">
          Every part of GSPS, explained in plain English. Read it here, or have it point things out on the real
          screens.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">Prefer to be shown around?</p>
            <p className="text-sm text-muted">
              The guided version highlights each part of the app as it describes it. {TOUR_STEPS.length} steps,
              about five minutes, and you can leave whenever you like.
            </p>
          </div>
          <StartTourButton className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-accent">
            <Compass className="h-4 w-4" />
            Start the tour
          </StartTourButton>
        </CardContent>
      </Card>

      <SnapshotDisclosure />

      {/*
        A contents list, because the refresher case is "find one thing", not
        "read all fifteen". The links are same-page hashes rather than a
        client-side accordion so a browser's Find-in-page still works across
        the whole document.
      */}
      <Card>
        <CardHeader>
          <CardTitle>What&apos;s in here</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {TOUR_STEPS.map((step, i) => (
              <li key={step.id} className="text-sm">
                <Link href={`#${step.id}`} className="text-accent hover:underline">
                  {i + 1}. {step.title}
                </Link>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {TOUR_STEPS.map((step, i) => (
        // `scroll-mt` clears the sticky header: without it a hash link lands
        // with the heading tucked underneath the nav bar.
        <Card key={step.id} id={step.id} className="scroll-mt-20">
          <CardHeader>
            {/* Same speaker as the overlay, so a reader who took the tour meets
                the same character on the same subject when they come back. */}
            <div className="flex items-center gap-2">
              <Mascot name={speakerFor(step.id)} size="sm" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {MASCOTS[speakerFor(step.id)].label}
              </span>
            </div>
            <CardTitle className="flex items-baseline gap-2">
              <span className="text-sm font-normal text-muted">{i + 1}</span>
              {step.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-3">
            {step.body.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed">
                {paragraph}
              </p>
            ))}
            {step.id === "meet-the-guides" && <MascotPair />}
            <SnapshotFigure figure={step.figure} />
            {(() => {
              const link = stepLink(step);
              return link ? (
                <Link href={link.href} className="w-fit text-sm font-medium text-accent hover:underline">
                  {link.label} →
                </Link>
              ) : null;
            })()}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Reading the onboarding flag must never throw, and must never guess "new user"
 * from bad input.
 *
 * `prefs` is a free-form jsonb column shared by every per-feature preference in
 * the app. Anything at all can be in there — an older shape, a half-written
 * value, a key some other feature owns — and the consequence of mishandling it
 * is not an error page: it is a modal tour opening over the top of someone
 * placing an order. So the contract is that every unrecognised shape resolves
 * to `UNSEEN` quietly, and only a real, well-formed record counts as seen.
 */

import { describe, expect, it } from "vitest";
import {
  UNSEEN,
  onboardingRecord,
  resolveOnboarding,
} from "@/lib/onboarding/status";
import { TOUR_VERSION } from "@/lib/onboarding/tour";

describe("resolveOnboarding", () => {
  it("treats a user with no settings row as new", () => {
    expect(resolveOnboarding(null)).toEqual(UNSEEN);
    expect(resolveOnboarding(undefined)).toEqual(UNSEEN);
    expect(resolveOnboarding({})).toEqual(UNSEEN);
  });

  it("survives every wrong shape it could be handed", () => {
    for (const junk of ["a string", 42, [], true, { onboarding: null }, { onboarding: "yes" }, { onboarding: [] }]) {
      expect(() => resolveOnboarding(junk)).not.toThrow();
      expect(resolveOnboarding(junk).seen).toBe(false);
    }
  });

  it("does not count a record with no timestamp as seen", () => {
    // `seen` is derived from `seenAt` rather than stored beside it, so a
    // half-written record cannot claim to have been shown.
    expect(resolveOnboarding({ onboarding: { version: 1, skipped: false } }).seen).toBe(false);
    expect(resolveOnboarding({ onboarding: { seenAt: 12345 } }).seen).toBe(false);
  });

  it("reads a real record back", () => {
    const status = resolveOnboarding({
      onboarding: { version: 1, seenAt: "2026-08-19T10:00:00.000Z", skipped: true },
    });
    expect(status).toEqual({ seen: true, version: 1, seenAt: "2026-08-19T10:00:00.000Z", skipped: true });
  });

  it("ignores the other keys sharing prefs with it", () => {
    const status = resolveOnboarding({
      guided: { riskPct: 1, maxTradesPerDay: 3 },
      onboarding: { version: 1, seenAt: "2026-08-19T10:00:00.000Z" },
    });
    expect(status.seen).toBe(true);
    expect(status.skipped).toBe(false);
  });
});

describe("onboardingRecord", () => {
  it("stamps the version so a later revision can tell the two apart", () => {
    const record = onboardingRecord("completed", new Date("2026-08-19T10:00:00.000Z"));
    expect(record).toEqual({ version: TOUR_VERSION, seenAt: "2026-08-19T10:00:00.000Z", skipped: false });
  });

  it("distinguishes skipping from finishing, and stops the prompt either way", () => {
    const skipped = onboardingRecord("skipped", new Date("2026-08-19T10:00:00.000Z"));
    expect(skipped.skipped).toBe(true);
    expect(resolveOnboarding({ onboarding: skipped }).seen).toBe(true);
  });

  it("round-trips through the resolver it feeds", () => {
    const record = onboardingRecord("completed");
    const status = resolveOnboarding({ onboarding: record });
    expect(status.seen).toBe(true);
    expect(status.skipped).toBe(false);
    expect(status.version).toBe(TOUR_VERSION);
  });
});

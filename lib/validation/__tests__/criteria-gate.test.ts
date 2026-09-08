/**
 * The merge gate.
 *
 * `npm test` already runs on every push and pull request (.github/workflows/
 * test.yml), so what fails here blocks a merge. Three things fail here:
 *
 *   1. A gate added to the app without being declared in the registry — which
 *      is the "identify a conflicting indicator *before* it reaches main" half.
 *      You cannot add a scored criterion, a Rules Alignment component, or a
 *      disqualifier without stating the direction you expect it to work in.
 *   2. A registry entry naming a gate that no longer exists, so the registry
 *      cannot rot into a list of things that used to be true.
 *   3. A criterion that a committed replay measured saturated or inverted,
 *      unless it is explicitly quarantined with a stated reason and exit.
 *
 * The payloads audited below are captured runs, not live ones: `/api/backtest`
 * needs vendor credentials and a signed-in session, so CI can only ever check
 * what has been committed under docs/replay-runs/. That is the intended shape —
 * a claim about criterion validity should be backed by a payload someone can
 * open, not by a number regenerated differently on every run.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CRITERION_KEYS } from "@/lib/scoring/weights";
import { UNCONDITIONED_ATTRIBUTION } from "@/lib/backtest/run";
import { CRITERIA_REGISTRY, criteriaByFamily } from "@/lib/validation/criteria-registry";
import {
  auditCriteria,
  errors,
  formatFindings,
  observationsFromFactors,
  type CriterionObservation,
} from "@/lib/validation/health";
import type { FactorAttribution } from "@/lib/backtest/attribution";

const ROOT = process.cwd();
const STATES = ["trendPullback", "trendBreakout", "confirmedReversal", "rangeReversion"];

/**
 * Breakdown keys as they appear in the source, read rather than imported: the
 * state modules build their nine components inline, so there is no exported
 * list to compare against. Reading the file is what makes this catch a key
 * someone adds without touching anything else.
 */
function keysDeclaredIn(relativePath: string): string[] {
  const source = readFileSync(path.join(ROOT, relativePath), "utf8");
  return [...source.matchAll(/\bkey:\s*"([^"]+)"/g)].map((m) => m[1]);
}

function registryIds(): Set<string> {
  return new Set(CRITERIA_REGISTRY.map((c) => c.id));
}

describe("criteria registry completeness", () => {
  it("declares every scored criterion the scan actually uses", () => {
    const declared = registryIds();
    const missing = CRITERION_KEYS.filter((k) => !declared.has(k));
    expect(
      missing,
      `Scored criteria missing from lib/validation/criteria-registry.ts: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it.each(STATES)("declares every Rules Alignment component in %s", (state) => {
    const declared = registryIds();
    const missing = keysDeclaredIn(`lib/signals/states/${state}.ts`)
      .map((key) => `${state}.${key}`)
      .filter((id) => !declared.has(id));
    expect(
      missing,
      `Alignment components missing from the registry: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("declares every disqualifier", () => {
    const declared = registryIds();
    const missing = keysDeclaredIn("lib/signals/disqualifiers.ts").filter((k) => !declared.has(k));
    expect(missing, `Disqualifiers missing from the registry: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not keep entries for gates that no longer exist", () => {
    const alignmentKeys = new Set(
      STATES.flatMap((state) =>
        keysDeclaredIn(`lib/signals/states/${state}.ts`).map((key) => `${state}.${key}`),
      ),
    );
    const disqualifierKeys = new Set(keysDeclaredIn("lib/signals/disqualifiers.ts"));
    const scoreKeys = new Set<string>(CRITERION_KEYS);

    const stale = CRITERIA_REGISTRY.filter((c) => {
      if (c.family === "rulesAlignment") return !alignmentKeys.has(c.id);
      if (c.family === "disqualifier") return !disqualifierKeys.has(c.id);
      if (c.family === "scanScore") return !scoreKeys.has(c.id);
      return false; // scoreHold entries are appended conditionally; no static list to check.
    }).map((c) => c.id);

    expect(stale, `Registry entries with no matching gate in the source: ${stale.join(", ")}`).toEqual(
      [],
    );
  });
});

describe("criteria registry hygiene", () => {
  it("gives every entry a stable, unique id", () => {
    const ids = CRITERIA_REGISTRY.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires a stated reason and exit for anything carried under quarantine", () => {
    const undocumented = CRITERIA_REGISTRY.filter(
      (c) => c.evidence === "quarantined" && !c.quarantineReason?.trim(),
    ).map((c) => c.id);
    expect(
      undocumented,
      "A quarantine without a stated reason is how a known defect becomes permanent",
    ).toEqual([]);
  });

  it("keeps the scored family aligned with the weight set that scores it", () => {
    expect(criteriaByFamily("scanScore").map((c) => c.id).sort()).toEqual([...CRITERION_KEYS].sort());
  });
});

interface ReplayPayload {
  timeframe: string;
  attributeWithin?: string | null;
  factors?: FactorAttribution[];
}

function committedPayloads(): Array<{ file: string; payload: ReplayPayload }> {
  const dir = path.join(ROOT, "docs/replay-runs");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => ({
      file,
      payload: JSON.parse(readFileSync(path.join(dir, file), "utf8")) as ReplayPayload,
    }))
    .filter(({ payload }) => Array.isArray(payload.factors) && payload.factors.length > 0);
}

describe("committed replay runs", () => {
  const payloads = committedPayloads();

  it("has runs to audit", () => {
    expect(payloads.length).toBeGreaterThan(0);
  });

  it.each(payloads.map(({ file }) => file))(
    "%s measures no undeclared, saturated or newly inverted criterion",
    (file) => {
      const { payload } = payloads.find((p) => p.file === file)!;
      const observations: CriterionObservation[] = observationsFromFactors(payload.factors ?? []);
      // An "all" payload is the unconditioned population, so it is the only
      // kind saturation can actually be assessed on — everything else names
      // the bucket the score selected and reports not-assessable.
      const scope = payload.attributeWithin ?? null;
      const report = auditCriteria(observations, {
        label: `${file} (${payload.timeframe})`,
        conditionedOn: scope === UNCONDITIONED_ATTRIBUTION ? null : scope,
      });

      expect(errors(report), `\n${formatFindings(errors(report))}\n`).toEqual([]);
    },
  );
});

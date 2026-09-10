/**
 * Validity checks over any pass/fail gate in the app.
 *
 * `lib/backtest/attribution.ts` answers "what did this criterion do?".
 * This answers the two questions that should have been blocking a merge all
 * along, and deliberately answers them for *any* gate, not just the nine
 * scored criteria — see `lib/validation/criteria-registry.ts`.
 *
 * **Saturation.** A criterion true for nearly every setup carries no
 * information while still contributing its point, which silently lowers the
 * threshold it exists to defend: with one of nine criteria always true, an
 * "Execute needs 7 of 9" gate is really 6 of the remaining 8, and nobody
 * decided that. The check is cheap, needs no outcome data, and would have
 * caught the `timeCycle` defect the day it shipped.
 *
 * **Sign.** A criterion whose measured correlation opposes the direction it
 * claims to work in is not a weak criterion — it is an inverted one, actively
 * pulling the verdict the wrong way. The registry records the claim; this
 * compares it against what a committed replay measured.
 *
 * One structural rule governs **both** checks: they are only meaningful on an
 * **unconditioned** population. Measured inside a bucket the score itself
 * selected — an `Execute`-only attribution, say — criteria saturate by
 * construction, because the bucket was defined by them passing; and their
 * signs are confounded, because conditioning on the score means conditioning
 * on a collider of all nine criteria. Reading either as a property of the
 * criterion would flag correct ones and launder real defects as expected
 * selection. So a conditioned sample reports "not-assessable" on both, and the
 * gate says what it would need instead rather than guessing.
 */

import { MIN_SAMPLES_PER_ARM, type FactorAttribution } from "@/lib/backtest/attribution";
import {
  CRITERIA_REGISTRY,
  findCriterion,
  type RegisteredCriterion,
} from "@/lib/validation/criteria-registry";

/**
 * Total observations below which a pass rate says nothing. At 20 trades a
 * criterion passing 19 times is one coin-flip away from passing 20, so calling
 * saturation there would fire on noise.
 */
export const MIN_OBSERVATIONS_FOR_SATURATION = 30;

/**
 * A criterion outside these bounds is not discriminating. Wide on purpose: the
 * check is meant to catch a gate that is effectively always (or never) true,
 * not to police a merely lopsided one.
 */
export const DEFAULT_SATURATION_BOUNDS = { minPassRate: 0.05, maxPassRate: 0.95 };

/**
 * How many standard errors a correlation must sit from zero before its sign
 * counts as measured. 1.96 is the two-tailed 5% level.
 *
 * This started life as a flat `|r| >= 0.1` cutoff, which was wrong in a way the
 * first real unconditioned run exposed immediately: a fixed magnitude is
 * blind to sample size. At n=13 a correlation of 0.3 is noise; at n=1005 a
 * correlation of 0.078 is a real effect (t≈2.5, p≈0.01). The flat cutoff called
 * the first significant and the second negligible — exactly backwards, and it
 * would have suppressed the strongest evidence the harness has ever produced
 * while firing on the weakest.
 *
 * The standard error of a Pearson r is ~1/sqrt(n-3), so the test is
 * |r| * sqrt(n-3) >= 1.96. A criterion that fails it reports "negligible": it
 * neither supports nor contradicts its declared sign on this sample. Repeated
 * across runs that is its own finding — a criterion doing nothing — which is
 * why it is still reported rather than dropped.
 */
export const MIN_SIGNIFICANCE_T = 1.96;

/**
 * Whether a correlation is distinguishable from zero at `MIN_SIGNIFICANCE_T`,
 * given the sample it was measured on. Exported because "is this real?" is the
 * question every reader of a factor table is actually asking.
 */
export function correlationSignificance(
  correlation: number,
  observations: number,
): { t: number; significant: boolean } {
  if (observations <= 3) return { t: 0, significant: false };
  const t = correlation * Math.sqrt(observations - 3);
  return { t, significant: Math.abs(t) >= MIN_SIGNIFICANCE_T };
}

export interface CriterionObservation {
  id: string;
  /** Times the criterion was evaluated and true. */
  passed: number;
  /** Times it was evaluated and false. Absent-from-a-setup is neither. */
  failed: number;
  /** Correlation between passing and realised R, when the sample could measure it. */
  correlation?: number;
  deltaExpectancyR?: number;
}

/** What the observations were drawn from, which decides what can be asked of them. */
export interface Population {
  label: string;
  /**
   * The verdict bucket or score band the sample was filtered to, if any.
   * Non-null makes saturation not-assessable — see the module note.
   */
  conditionedOn?: string | null;
}

export type SaturationStatus =
  | "ok"
  | "saturated"
  | "starved"
  | "insufficient"
  | "not-assessable";

export type SignStatus =
  | "ok"
  | "inverted"
  | "negligible"
  | "insufficient"
  | "not-assessable"
  | "not-applicable";

export interface SaturationResult {
  status: SaturationStatus;
  passRate: number | null;
  observations: number;
}

export interface SignResult {
  status: SignStatus;
  correlation?: number;
}

export function checkSaturation(
  observation: CriterionObservation,
  population: Population,
  criterion?: RegisteredCriterion,
): SaturationResult {
  const observations = observation.passed + observation.failed;
  const passRate = observations === 0 ? null : observation.passed / observations;

  if (population.conditionedOn) {
    return { status: "not-assessable", passRate, observations };
  }
  if (observations < MIN_OBSERVATIONS_FOR_SATURATION) {
    return { status: "insufficient", passRate, observations };
  }

  const bounds = criterion?.saturation ?? DEFAULT_SATURATION_BOUNDS;
  if (passRate === null) return { status: "insufficient", passRate, observations };
  if (passRate > bounds.maxPassRate) return { status: "saturated", passRate, observations };
  if (passRate < bounds.minPassRate) return { status: "starved", passRate, observations };
  return { status: "ok", passRate, observations };
}

export function checkSign(
  observation: CriterionObservation,
  criterion: RegisteredCriterion,
  population?: Population,
): SignResult {
  if (criterion.expectedSign === "unknown") return { status: "not-applicable" };

  // Same restriction as saturation, for a sharper reason. A verdict bucket is
  // selected on the score, and the score is a sum of the very criteria being
  // measured — so conditioning on it is conditioning on a collider, which
  // induces dependence among the criteria that has nothing to do with whether
  // any of them predicts a winning trade. Observed directly: harmonicProximity
  // measures a significant −0.134 inside a 2026-08-12 Execute slice (arms
  // 275/15) and a significant +0.078 on the unconditioned 1,005-trade
  // population (arms 442/563). Both clear the significance bar; they cannot
  // both be the criterion's effect, and the confounded one is the bucket.
  if (population?.conditionedOn) return { status: "not-assessable" };

  const bothArmsCarry =
    observation.passed >= MIN_SAMPLES_PER_ARM && observation.failed >= MIN_SAMPLES_PER_ARM;
  if (!bothArmsCarry || observation.correlation === undefined) {
    return { status: "insufficient", correlation: observation.correlation };
  }

  const { significant } = correlationSignificance(
    observation.correlation,
    observation.passed + observation.failed,
  );
  if (!significant) {
    return { status: "negligible", correlation: observation.correlation };
  }

  const measuredPositive = observation.correlation > 0;
  const expectedPositive = criterion.expectedSign === "positive";
  return {
    status: measuredPositive === expectedPositive ? "ok" : "inverted",
    correlation: observation.correlation,
  };
}

export type FindingSeverity = "error" | "warn" | "info";

export interface AuditFinding {
  severity: FindingSeverity;
  id: string;
  kind:
    | "unregistered"
    | "saturated"
    | "starved"
    | "sign-inverted"
    | "no-measured-effect"
    | "quarantine-liftable"
    | "retired-criterion"
    | "coverage-gap"
    | "saturation-not-assessable";
  message: string;
}

export interface AuditReport {
  population: Population;
  findings: AuditFinding[];
  measured: number;
  /** Registered criteria this population produced no observation for. */
  uncovered: string[];
}

/**
 * Compare a population's observations against what the registry claims.
 *
 * A quarantined criterion still produces its finding — it is never silently
 * skipped — but downgraded from error to warn, so a known-bad gate can be
 * carried deliberately without either blocking every future merge or
 * disappearing from view. Anything not quarantined that measures saturated or
 * inverted is an error, which is what makes this a gate rather than a report.
 */
export function auditCriteria(
  observations: CriterionObservation[],
  population: Population,
  registry: RegisteredCriterion[] = CRITERIA_REGISTRY,
): AuditReport {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  for (const observation of observations) {
    seen.add(observation.id);
    const criterion = registry.find((c) => c.id === observation.id) ?? findCriterion(observation.id);

    if (!criterion) {
      findings.push({
        severity: "error",
        id: observation.id,
        kind: "unregistered",
        message:
          `"${observation.id}" was measured but is not declared in lib/validation/criteria-registry.ts. ` +
          "Add it with the sign you expect it to work in.",
      });
      continue;
    }

    // A retired criterion is history, not a live gate: historical payloads
    // measured it, and gating on something the code no longer scores would
    // block merges over the past.
    if (criterion.evidence === "retired") {
      findings.push({
        severity: "info",
        id: criterion.id,
        kind: "retired-criterion",
        message: `${criterion.id} is retired and no longer scored; ${population.label} predates the change.`,
      });
      continue;
    }

    const quarantined = criterion.evidence === "quarantined";
    const downgrade = (s: FindingSeverity): FindingSeverity => (quarantined ? "warn" : s);

    const saturation = checkSaturation(observation, population, criterion);
    if (saturation.status === "saturated" || saturation.status === "starved") {
      const pct = ((saturation.passRate ?? 0) * 100).toFixed(1);
      findings.push({
        severity: downgrade("error"),
        id: criterion.id,
        kind: saturation.status,
        message:
          `${criterion.id} passed ${pct}% of ${saturation.observations} observations in ` +
          `${population.label} — it is not discriminating, so it contributes its weight without ` +
          `carrying information (${criterion.source}).`,
      });
    }
    if (saturation.status === "not-assessable") {
      findings.push({
        severity: "info",
        id: criterion.id,
        kind: "saturation-not-assessable",
        message:
          `${criterion.id}: saturation unmeasurable in ${population.label}, which is conditioned on ` +
          `"${population.conditionedOn}". Needs an unconditioned population to assess.`,
      });
    }

    const sign = checkSign(observation, criterion, population);
    if (sign.status === "inverted") {
      findings.push({
        severity: downgrade("error"),
        id: criterion.id,
        kind: "sign-inverted",
        message:
          `${criterion.id} claims to be ${criterion.expectedSign} but measured ` +
          `${sign.correlation?.toFixed(3)} in ${population.label} (${criterion.source}).` +
          (quarantined ? " Known — carried under quarantine." : ""),
      });
    }
    if (sign.status === "negligible") {
      findings.push({
        severity: "info",
        id: criterion.id,
        kind: "no-measured-effect",
        message:
          `${criterion.id} measured ${sign.correlation?.toFixed(3)} (t=${correlationSignificance(
            observation.correlation ?? 0,
            observation.passed + observation.failed,
          ).t.toFixed(2)}) in ${population.label} — not distinguishable from zero, so this run ` +
          "neither supports nor contradicts its declared sign.",
      });
    }
    if (sign.status === "ok" && quarantined) {
      findings.push({
        severity: "warn",
        id: criterion.id,
        kind: "quarantine-liftable",
        message:
          `${criterion.id} is quarantined but measured in its declared direction in ` +
          `${population.label}. Re-check whether the quarantine still applies.`,
      });
    }
  }

  const uncovered = registry.filter((c) => !seen.has(c.id)).map((c) => c.id);
  for (const id of uncovered) {
    findings.push({
      severity: "info",
      id,
      kind: "coverage-gap",
      message: `${id} is declared but ${population.label} measured nothing against it.`,
    });
  }

  return { population, findings, measured: seen.size, uncovered };
}

/** Adapter for a committed replay payload's `factors` table. */
export function observationsFromFactors(factors: FactorAttribution[]): CriterionObservation[] {
  return factors.map((f) => ({
    id: f.criterion,
    passed: f.passed.n,
    failed: f.failed.n,
    correlation: f.correlation,
    deltaExpectancyR: f.deltaExpectancyR,
  }));
}

export function errors(report: AuditReport): AuditFinding[] {
  return report.findings.filter((f) => f.severity === "error");
}

/** One-line-per-finding rendering, for a test failure message or a CI log. */
export function formatFindings(findings: AuditFinding[]): string {
  return findings.map((f) => `[${f.severity}] ${f.kind}: ${f.message}`).join("\n");
}

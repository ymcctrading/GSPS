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
 * One structural rule governs saturation: it is only meaningful on an
 * **unconditioned** population. Measured inside a bucket the score itself
 * selected — an `Execute`-only attribution, say — criteria saturate by
 * construction, because the bucket was defined by them passing. Reading that
 * as a defect would flag correct criteria and, worse, launder real saturation
 * as expected selection. So a conditioned sample reports "not-assessable" and
 * the gate says what it would need instead, rather than guessing.
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
 * Correlation magnitude below which a sign is not a sign.
 *
 * Without this the check reads every negative float as an inversion, and the
 * committed runs are full of criteria measuring −0.003 or −0.015 — noise around
 * zero, not evidence of a criterion pulling the wrong way. Blocking merges on
 * those would train everyone to quarantine reflexively, which is how a gate
 * stops meaning anything. A criterion under this magnitude reports "negligible":
 * it did not measure as claimed, but it did not measure against the claim
 * either. Repeated across runs that is its own finding — a criterion doing
 * nothing — which is why it is still reported rather than dropped.
 */
export const MIN_MEANINGFUL_CORRELATION = 0.1;

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
): SignResult {
  if (criterion.expectedSign === "unknown") return { status: "not-applicable" };

  const bothArmsCarry =
    observation.passed >= MIN_SAMPLES_PER_ARM && observation.failed >= MIN_SAMPLES_PER_ARM;
  if (!bothArmsCarry || observation.correlation === undefined) {
    return { status: "insufficient", correlation: observation.correlation };
  }

  if (Math.abs(observation.correlation) < MIN_MEANINGFUL_CORRELATION) {
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

    const sign = checkSign(observation, criterion);
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
          `${criterion.id} measured ${sign.correlation?.toFixed(3)} in ${population.label} — inside ` +
          `the ±${MIN_MEANINGFUL_CORRELATION} noise band, so this run neither supports nor ` +
          "contradicts its declared sign.",
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

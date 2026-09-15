import { describe, expect, it } from "vitest";
import {
  auditCriteria,
  checkSaturation,
  checkSign,
  errors,
  observationsFromFactors,
  MIN_OBSERVATIONS_FOR_SATURATION,
  type CriterionObservation,
  type Population,
} from "@/lib/validation/health";
import type { RegisteredCriterion } from "@/lib/validation/criteria-registry";

const UNCONDITIONED: Population = { label: "test population" };
const CONDITIONED: Population = { label: "Execute-only", conditionedOn: "Execute" };

function criterion(over: Partial<RegisteredCriterion> = {}): RegisteredCriterion {
  return {
    id: "test",
    family: "scanScore",
    source: "lib/scoring/score.ts",
    label: "Test",
    expectedSign: "positive",
    evidence: "hypothesis",
    ...over,
  };
}

function observation(over: Partial<CriterionObservation> = {}): CriterionObservation {
  return { id: "test", passed: 50, failed: 50, correlation: 0.2, ...over };
}

describe("checkSaturation", () => {
  it("flags a criterion that is true for nearly every setup", () => {
    const result = checkSaturation(observation({ passed: 99, failed: 1 }), UNCONDITIONED);
    expect(result.status).toBe("saturated");
    expect(result.passRate).toBeCloseTo(0.99);
  });

  it("flags a criterion that almost never fires", () => {
    expect(checkSaturation(observation({ passed: 1, failed: 99 }), UNCONDITIONED).status).toBe(
      "starved",
    );
  });

  it("passes a criterion that genuinely discriminates", () => {
    expect(checkSaturation(observation({ passed: 60, failed: 40 }), UNCONDITIONED).status).toBe("ok");
  });

  it("refuses to judge a sample too small for a pass rate to mean anything", () => {
    const tiny = observation({ passed: MIN_OBSERVATIONS_FOR_SATURATION - 1, failed: 0 });
    expect(checkSaturation(tiny, UNCONDITIONED).status).toBe("insufficient");
  });

  it("refuses to judge a bucket-conditioned sample, where criteria saturate by construction", () => {
    // Inside Execute the score already selected on these criteria, so a 99%
    // pass rate is the bucket definition, not a defect. Reading it as one would
    // flag correct criteria and launder real saturation as expected selection.
    const result = checkSaturation(observation({ passed: 99, failed: 1 }), CONDITIONED);
    expect(result.status).toBe("not-assessable");
  });

  it("honours a per-criterion override for a structurally constant gate", () => {
    const alwaysTrue = observation({ passed: 100, failed: 0 });
    const exempt = criterion({ saturation: { minPassRate: 0, maxPassRate: 1 } });
    expect(checkSaturation(alwaysTrue, UNCONDITIONED, exempt).status).toBe("ok");
  });
});

describe("checkSign", () => {
  it("flags a criterion measuring against the direction it claims", () => {
    const result = checkSign(observation({ correlation: -0.3 }), criterion());
    expect(result.status).toBe("inverted");
  });

  it("passes a criterion measuring in its declared direction", () => {
    expect(checkSign(observation({ correlation: 0.3 }), criterion()).status).toBe("ok");
  });

  it("respects a criterion declared to work negatively", () => {
    const negative = criterion({ expectedSign: "negative" });
    expect(checkSign(observation({ correlation: -0.3 }), negative).status).toBe("ok");
    expect(checkSign(observation({ correlation: 0.3 }), negative).status).toBe("inverted");
  });

  it("does not call noise around zero an inversion", () => {
    // The committed runs are full of criteria measuring -0.003 or -0.015.
    // Treating those as inverted would block merges on noise, and a gate that
    // cries wolf gets quarantined into uselessness.
    const result = checkSign(observation({ correlation: -0.003 }), criterion());
    expect(result.status).toBe("negligible");
  });

  it("weighs a correlation against the sample it came from, not a flat cutoff", () => {
    // The same |r| is noise on a small sample and a real effect on a large one.
    // A flat magnitude cutoff got this exactly backwards on the first real
    // unconditioned run: it called r=0.3 at n=13 meaningful and r=0.078 at
    // n=1005 (t≈2.5) negligible.
    const small = observation({ passed: 15, failed: 15, correlation: -0.3 });
    expect(checkSign(small, criterion()).status).toBe("negligible");

    const large = observation({ passed: 442, failed: 563, correlation: 0.0784 });
    expect(checkSign(large, criterion()).status).toBe("ok");
  });

  it("still flags an inversion when the sample can carry it", () => {
    const inverted = observation({ passed: 500, failed: 500, correlation: -0.134 });
    expect(checkSign(inverted, criterion()).status).toBe("inverted");
  });

  it("will not read a sign off an arm below the attribution floor", () => {
    const thin = observation({ passed: 3, failed: 97, correlation: -0.9 });
    expect(checkSign(thin, criterion()).status).toBe("insufficient");
  });

  it("will not read a sign off a sample the score already selected", () => {
    // Conditioning on the score conditions on a collider of all nine criteria,
    // so a marginal correlation inside a bucket is confounded. Observed live:
    // harmonicProximity reads a significant -0.134 inside an Execute slice and
    // a significant +0.078 unconditioned.
    const inside = observation({ passed: 275, failed: 15, correlation: -0.134 });
    expect(checkSign(inside, criterion(), CONDITIONED).status).toBe("not-assessable");
    expect(checkSign(inside, criterion(), UNCONDITIONED).status).toBe("inverted");
  });

  it("does not judge a gate whose effect outcome data cannot see", () => {
    // Disqualifiers block the trade, so there is no realised R to correlate.
    const blocked = criterion({ expectedSign: "unknown", family: "disqualifier" });
    expect(checkSign(observation({ correlation: -0.9 }), blocked).status).toBe("not-applicable");
  });
});

describe("auditCriteria", () => {
  const registry = [criterion({ id: "good" }), criterion({ id: "bad" })];

  it("fails a build when a criterion is measured but never declared", () => {
    const report = auditCriteria([observation({ id: "undeclared" })], UNCONDITIONED, registry);
    const found = errors(report);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("unregistered");
  });

  it("fails a build on a newly inverted criterion", () => {
    const report = auditCriteria(
      [observation({ id: "bad", correlation: -0.4 })],
      UNCONDITIONED,
      registry,
    );
    expect(errors(report).map((f) => f.kind)).toContain("sign-inverted");
  });

  it("downgrades a quarantined criterion to a warning without hiding it", () => {
    const quarantined = [
      criterion({ id: "bad", evidence: "quarantined", quarantineReason: "known" }),
    ];
    const report = auditCriteria(
      [observation({ id: "bad", correlation: -0.4 })],
      UNCONDITIONED,
      quarantined,
    );
    expect(errors(report)).toHaveLength(0);
    expect(report.findings.some((f) => f.kind === "sign-inverted" && f.severity === "warn")).toBe(
      true,
    );
  });

  it("says so when a quarantined criterion starts measuring correctly again", () => {
    const quarantined = [
      criterion({ id: "bad", evidence: "quarantined", quarantineReason: "known" }),
    ];
    const report = auditCriteria(
      [observation({ id: "bad", correlation: 0.4 })],
      UNCONDITIONED,
      quarantined,
    );
    expect(report.findings.some((f) => f.kind === "quarantine-liftable")).toBe(true);
  });

  it("reports a declared criterion the run measured nothing against", () => {
    const report = auditCriteria([observation({ id: "good" })], UNCONDITIONED, registry);
    expect(report.uncovered).toEqual(["bad"]);
    expect(report.findings.some((f) => f.kind === "coverage-gap" && f.id === "bad")).toBe(true);
  });
});

describe("observationsFromFactors", () => {
  it("carries a replay payload's factor table straight into an observation", () => {
    const [obs] = observationsFromFactors([
      {
        criterion: "timeCycle",
        observed: 28,
        passed: { n: 17, wins: 3, winRate: 0.176, expectancyR: -0.479 },
        failed: { n: 11, wins: 5, winRate: 0.454, expectancyR: 0.349 },
        deltaExpectancyR: -0.828,
        correlation: -0.299,
        verdict: "informative",
      },
    ]);
    expect(obs).toMatchObject({ id: "timeCycle", passed: 17, failed: 11, correlation: -0.299 });
  });
});

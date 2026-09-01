/**
 * The Three-Element Method — Signal / Bull Case / Bear Challenge /
 * Operator's Decision — as a reusable submission shape and server-side
 * scoring rubric, per the GSPS School product spec.
 *
 * Bull and Bear name two complementary decision *functions* —
 * initiative-hypothesis and discernment-falsification. The synthesis step
 * (`OperatorDecision`) is deliberately neutral.
 *
 * Scoring here is intentionally conservative and heuristic: it checks for
 * non-trivial, specific content rather than attempting real natural-
 * language understanding. It exists to block the two failure modes the
 * spec calls out explicitly — empty/boilerplate fields, and a Bear
 * challenge that never actually engages with the Bull case or Signal — not
 * to grade trading judgment with certainty. Every score is
 * Learner-reported in provenance terms; see lib/school/curriculum.ts's
 * metricsShown convention.
 */

export type OperatorAction =
  | "no_trade"
  | "watchlist"
  | "conditional_entry"
  | "reduced_risk_entry"
  | "standard_risk_entry"
  | "exit"
  | "review_required";

export const OPERATOR_ACTIONS: readonly OperatorAction[] = [
  "no_trade",
  "watchlist",
  "conditional_entry",
  "reduced_risk_entry",
  "standard_risk_entry",
  "exit",
  "review_required",
] as const;

export interface SignalInput {
  instrument: string;
  timeframe: string;
  setupOrState: string;
  evidence: string;
  uncertainty: string;
  catalystOrEventContext: string;
  sourceProvenance: string;
}

export interface BullCaseInput {
  thesis: string;
  supportingEvidence: string;
  confirmation: string;
  entryCondition: string;
  upsideScenario: string;
  target: string;
  thesisWeakeningConditions: string;
}

export interface BearCaseInput {
  contradictoryEvidence: string;
  invalidation: string;
  hardStop: string;
  liquidityVolatilityEventRisk: string;
  positionSizeConsequence: string;
}

export interface OperatorDecisionInput {
  action: OperatorAction;
  nextObservableCondition: string;
  riskAction: string;
  reversalCondition: string;
}

export interface RegimeCheckpointInput {
  trendRangeTransition: "trend" | "range" | "transition" | "dislocation";
  volatilityState: string;
  liquidity: string;
  scheduledCatalyst: string;
  controllingTimeframe: string;
  conflictingTimeframeEvidence: string;
  disqualifier: string;
  actionState: OperatorAction;
}

export interface ThreeElementSubmission {
  signal: SignalInput;
  bull: BullCaseInput;
  bear: BearCaseInput;
  operator: OperatorDecisionInput;
  regime?: RegimeCheckpointInput;
}

export interface FieldValidationResult {
  ok: boolean;
  errors: readonly string[];
}

const MIN_FIELD_LENGTH = 8;
// Generic boilerplate the Bear challenge (and other free-text fields) must
// not consist of alone — case-insensitive substring match against the
// trimmed, lowercased field. Kept short and specific on purpose: this is a
// floor against literally-empty effort, not a plagiarism detector.
const BOILERPLATE_PHRASES = [
  "past performance is not indicative of future results",
  "prices can go up or down",
  "trading involves risk",
  "n/a",
  "none",
  "idk",
  "test",
  "asdf",
];

// Fields that legitimately hold a short, specific value (a ticker, a
// timeframe label, a price level) rather than a sentence — these use a
// much lower floor; the field just needs to be present and not boilerplate.
const SHORT_VALUE_FIELDS = new Set([
  "signal.instrument",
  "signal.timeframe",
  "bull.target",
  "bear.hardStop",
  "regime.controllingTimeframe",
]);

function isNonTrivial(text: string, minLength = MIN_FIELD_LENGTH): boolean {
  const trimmed = text.trim();
  if (trimmed.length < minLength) return false;
  const lower = trimmed.toLowerCase();
  if (BOILERPLATE_PHRASES.some((phrase) => lower === phrase)) return false;
  // Reject strings that are just one repeated character/word ("aaaaaaaa").
  const words = lower.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words);
  if (words.length > 2 && uniqueWords.size === 1) return false;
  return true;
}

function requireField(errors: string[], path: string, value: string): void {
  const minLength = SHORT_VALUE_FIELDS.has(path) ? 1 : MIN_FIELD_LENGTH;
  if (!isNonTrivial(value, minLength)) {
    errors.push(`${path}: required and must be a specific, non-trivial statement`);
  }
}

/** Structural + non-triviality validation. Does not require entry, but requires every listed field to be present when a submission is marked ready. */
export function validateSignal(signal: SignalInput): FieldValidationResult {
  const errors: string[] = [];
  requireField(errors, "signal.instrument", signal.instrument);
  requireField(errors, "signal.timeframe", signal.timeframe);
  requireField(errors, "signal.setupOrState", signal.setupOrState);
  requireField(errors, "signal.evidence", signal.evidence);
  requireField(errors, "signal.uncertainty", signal.uncertainty);
  requireField(errors, "signal.catalystOrEventContext", signal.catalystOrEventContext);
  requireField(errors, "signal.sourceProvenance", signal.sourceProvenance);
  return { ok: errors.length === 0, errors };
}

export function validateBullCase(bull: BullCaseInput): FieldValidationResult {
  const errors: string[] = [];
  requireField(errors, "bull.thesis", bull.thesis);
  requireField(errors, "bull.supportingEvidence", bull.supportingEvidence);
  requireField(errors, "bull.confirmation", bull.confirmation);
  requireField(errors, "bull.entryCondition", bull.entryCondition);
  requireField(errors, "bull.upsideScenario", bull.upsideScenario);
  requireField(errors, "bull.target", bull.target);
  requireField(errors, "bull.thesisWeakeningConditions", bull.thesisWeakeningConditions);
  return { ok: errors.length === 0, errors };
}

/**
 * The Bear case is where the spec's quality bar bites hardest: it must not
 * only be non-trivial, its `contradictoryEvidence` must share meaningful
 * vocabulary with the Bull case or Signal — a generic downside disclaimer
 * that could be pasted onto any trade must not pass. This is a heuristic
 * (shared-word overlap, deliberately generous), not certainty.
 */
export function validateBearCase(bear: BearCaseInput, bull: BullCaseInput, signal: SignalInput): FieldValidationResult {
  const errors: string[] = [];
  requireField(errors, "bear.contradictoryEvidence", bear.contradictoryEvidence);
  requireField(errors, "bear.invalidation", bear.invalidation);
  requireField(errors, "bear.hardStop", bear.hardStop);
  requireField(errors, "bear.liquidityVolatilityEventRisk", bear.liquidityVolatilityEventRisk);
  requireField(errors, "bear.positionSizeConsequence", bear.positionSizeConsequence);

  if (isNonTrivial(bear.contradictoryEvidence) && !referencesBullOrSignal(bear.contradictoryEvidence, bull, signal)) {
    errors.push(
      "bear.contradictoryEvidence: must engage with something specific from the Bull case or Signal, not a generic disclaimer",
    );
  }
  return { ok: errors.length === 0, errors };
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for", "is", "are", "was", "were",
  "be", "been", "with", "this", "that", "it", "as", "by", "from", "will", "would", "could", "should",
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );
}

function referencesBullOrSignal(bearText: string, bull: BullCaseInput, signal: SignalInput): boolean {
  const bearWords = significantWords(bearText);
  if (bearWords.size === 0) return false;
  const referenceWords = new Set([
    ...significantWords(bull.thesis),
    ...significantWords(bull.supportingEvidence),
    ...significantWords(bull.entryCondition),
    ...significantWords(signal.setupOrState),
    ...significantWords(signal.instrument),
    ...significantWords(signal.evidence),
  ]);
  for (const w of bearWords) {
    if (referenceWords.has(w)) return true;
  }
  return false;
}

export function validateOperatorDecision(operator: OperatorDecisionInput): FieldValidationResult {
  const errors: string[] = [];
  if (!OPERATOR_ACTIONS.includes(operator.action)) {
    errors.push("operator.action: must be one of the defined Operator's Decision actions");
  }
  requireField(errors, "operator.nextObservableCondition", operator.nextObservableCondition);
  requireField(errors, "operator.riskAction", operator.riskAction);
  requireField(errors, "operator.reversalCondition", operator.reversalCondition);
  return { ok: errors.length === 0, errors };
}

export function validateRegimeCheckpoint(regime: RegimeCheckpointInput): FieldValidationResult {
  const errors: string[] = [];
  const validStructures = ["trend", "range", "transition", "dislocation"];
  if (!validStructures.includes(regime.trendRangeTransition)) {
    errors.push("regime.trendRangeTransition: must be trend, range, transition, or dislocation");
  }
  requireField(errors, "regime.volatilityState", regime.volatilityState);
  requireField(errors, "regime.liquidity", regime.liquidity);
  requireField(errors, "regime.controllingTimeframe", regime.controllingTimeframe);
  requireField(errors, "regime.conflictingTimeframeEvidence", regime.conflictingTimeframeEvidence);
  if (!OPERATOR_ACTIONS.includes(regime.actionState)) {
    errors.push("regime.actionState: must be one of the defined action states");
  }
  // scheduledCatalyst and disqualifier may legitimately be "none" (i.e. no
  // catalyst, no disqualifier found) — those are not required non-trivial,
  // only present.
  if (regime.scheduledCatalyst == null) errors.push("regime.scheduledCatalyst: required (may state 'none identified')");
  if (regime.disqualifier == null) errors.push("regime.disqualifier: required (may state 'none identified')");
  return { ok: errors.length === 0, errors };
}

export interface ThreeElementValidationResult {
  ok: boolean;
  errors: readonly string[];
}

/**
 * Full-submission gate: every element must validate, and when the lesson
 * requires a regime checkpoint, it must be present and valid too. This is
 * what lib/school/gates.ts and the lab-submission API route call before
 * accepting a completion — never trust a client-supplied "complete" flag.
 */
export function validateThreeElementSubmission(
  submission: ThreeElementSubmission,
  opts: { requiresRegimeCheckpoint: boolean },
): ThreeElementValidationResult {
  const errors: string[] = [
    ...validateSignal(submission.signal).errors,
    ...validateBullCase(submission.bull).errors,
    ...validateBearCase(submission.bear, submission.bull, submission.signal).errors,
    ...validateOperatorDecision(submission.operator).errors,
  ];
  if (opts.requiresRegimeCheckpoint) {
    if (!submission.regime) {
      errors.push("regime: a market-regime checkpoint is required before this activity can be submitted");
    } else {
      errors.push(...validateRegimeCheckpoint(submission.regime).errors);
    }
  }
  return { ok: errors.length === 0, errors };
}

export interface RubricScore {
  bullThesis: number;
  bearChallenge: number;
  tension: number;
  decision: number;
  total: number;
}

/**
 * Heuristic quality rubric (0-1 per dimension), used to populate
 * school_learning_labs.score_breakdown for the learner's own review — never
 * used as a pass/fail gate by itself (validateThreeElementSubmission is the
 * gate; this is a quality signal shown alongside it, always labeled
 * Learner-reported).
 */
export function scoreThreeElementSubmission(submission: ThreeElementSubmission): RubricScore {
  const bullThesis = lengthScore(submission.bull.thesis) * 0.5 + lengthScore(submission.bull.supportingEvidence) * 0.5;
  const referencesBull = referencesBullOrSignal(submission.bear.contradictoryEvidence, submission.bull, submission.signal);
  const bearChallenge =
    (referencesBull ? 0.6 : 0) +
    (isNonTrivial(submission.bear.invalidation) ? 0.2 : 0) +
    (isNonTrivial(submission.bear.hardStop) ? 0.2 : 0);
  const tension = referencesBull && isNonTrivial(submission.bull.thesisWeakeningConditions) ? 1 : referencesBull ? 0.6 : 0.1;
  const decision =
    (OPERATOR_ACTIONS.includes(submission.operator.action) ? 0.4 : 0) +
    (isNonTrivial(submission.operator.nextObservableCondition) ? 0.3 : 0) +
    (isNonTrivial(submission.operator.reversalCondition) ? 0.3 : 0);
  const total = (bullThesis + bearChallenge + tension + decision) / 4;
  return { bullThesis, bearChallenge, tension, decision, total };
}

function lengthScore(text: string): number {
  const len = text.trim().length;
  if (len < MIN_FIELD_LENGTH) return 0;
  return Math.min(1, len / 120);
}

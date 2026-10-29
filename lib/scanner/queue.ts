/**
 * GSPS — the intraday scan's queue: which instruments the scheduled scan
 * times when there are more candidates than its capacity (owner, 2026-10-28:
 * "tracks candidates without starvation"). A queue policy, not a trading
 * rule: it decides only what is examined, never what is traded. Live in the
 * scheduled intraday scan since 2026-10-28 (owner, "I approve all 5").
 *
 * Before: one ordered list cut at 50 (`MAX_SYSTEM_UNIVERSE`): the funds and
 * crypto, then the session's setups, the members' watchlists and the first 36
 * focus names. The focus list stored 72, but nothing past rank 36 was ever
 * timed, even with slots free (October 27: 5 core + 36 focus = 41 of 50, so
 * BA at rank 48 sat out with nine slots empty), and a long watchlist or a full
 * set of setups could take every slot the focus names had.
 *
 * Here every tier has a reserved share, a share no other tier can take, and
 * what a tier leaves unused goes to the rest. Tiers, in order:
 *   core       the index funds and crypto the scan always reads;
 *   plans      standing daily setups ready today (`lib/scanner/sessionSetups.ts`);
 *   discovery  stocks the session has made active (`lib/scanner/discovery.ts`);
 *   focus      the evening's focus list, reserves included (rank order);
 *   watched    members' watchlists (most-watched first).
 * Standing setups and watched names beyond their share then take the slots
 * other tiers left unused (`FIRST_CLAIM`), never the wheel's own share.
 * Then a rotating share: the candidates not yet given a slot, taken from an
 * offset that moves with the clock, so a deferred name gets a turn on a later
 * scan. The offset is read from the time (as `universe-rotation.ts` reads its
 * chunk), never from a stored counter: a missed or repeated tick picks the
 * right slice, and two runs at the same time choose the same names.
 *
 * Deterministic: the same inputs and tick give the same selection. Every
 * figure here (the capacity, each share, the rotation's step) is an
 * engineering choice sized to the free feed and the scan's time budget,
 * labelled; none is a market claim.
 *
 * Mandate: 1. Gann chose his active stocks from the charts the night before
 * and timed them in the session (Master Course Ch. 13); the plans and focus
 * tiers carry that, discovery adds the stock the session itself brings
 * forward. 2. Rhythm (the rotation is a returning wheel, not a drain), Dewey's
 * phase-resumption as an engineering property only. 3. Polarity: the
 * standing plan and the newly active stock are held in one queue, neither
 * starving the other. Law of Creation: reserved shares ⊗ a returning wheel;
 * either alone starves someone.
 */

export type QueueTier = "core" | "plans" | "discovery" | "focus" | "watched" | "rotating";

export const TIER_ORDER: readonly Exclude<QueueTier, "rotating">[] = ["core", "plans", "discovery", "focus", "watched"];

export interface QueueShares {
  core: number;
  plans: number;
  discovery: number;
  focus: number;
  watched: number;
  rotating: number;
}

/**
 * The scheduled scan's capacity (engineering, labelled; the live cap reads it).
 * 50 until 2026-10-29, raised to 100 on the owner's word ("yes, raise the
 * cap"): 50-symbol scans returned in about 5-12 s against a 60 s call, and the
 * bars come in batches of 100 symbols, so 100 is one batch more at most.
 */
export const QUEUE_CAPACITY = 100;

/**
 * Each tier's reserved share of `QUEUE_CAPACITY` (engineering, labelled).
 * Core is always read whole, whatever its share says; the rest sum to 90 (the
 * 50-slot shares doubled with the capacity), so with core at 10 or fewer the
 * wheel always keeps its 10.
 */
export const DEFAULT_SHARES: QueueShares = { core: 10, plans: 28, discovery: 16, focus: 24, watched: 12, rotating: 10 };

export interface QueueCandidate {
  symbol: string;
  /** Rank within its own tier, from 1. */
  tierRank: number;
}

export interface QueueInput {
  capacity?: number;
  shares?: QueueShares;
  core: readonly string[];
  plans: readonly string[];
  discovery: readonly string[];
  focus: readonly string[];
  watched: readonly string[];
  /** The rotation's tick: `rotationTick(now)`. */
  tick: number;
}

export interface QueueEntry {
  symbol: string;
  tier: QueueTier;
  /** The candidate's own tier, also for one given a rotating slot. */
  sourceTier: Exclude<QueueTier, "rotating">;
  tierRank: number;
}

export interface QueuePlan {
  selected: QueueEntry[];
  deferred: (QueueEntry & { reason: "capacity" })[];
  /** Selected count per tier (rotating slots under "rotating"). */
  byTier: Record<QueueTier, number>;
  capacity: number;
  tick: number;
}

/**
 * Tiers whose names beyond their share take free slots before the wheel turns
 * (engineering, labelled): a standing setup and a watched name take the slots
 * other tiers left unused, ahead of the wheel, which keeps its own share.
 */
export const FIRST_CLAIM: readonly Exclude<QueueTier, "rotating">[] = ["plans", "watched"];

/** Minutes per rotation step (engineering: one scheduled intraday scan). */
export const ROTATION_STEP_MINUTES = 15;

/** The rotation's tick, read from the clock: whole steps since the epoch. */
export function rotationTick(now: Date, stepMinutes: number = ROTATION_STEP_MINUTES): number {
  const t = now.getTime();
  if (!Number.isFinite(t) || !(stepMinutes > 0)) return 0;
  return Math.floor(t / (stepMinutes * 60_000));
}

const clean = (s: string) => (typeof s === "string" ? s.trim().toUpperCase() : "");
const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * The queue's plan. Each symbol belongs to the first tier that lists it (a
 * stock that is both a standing plan and on the focus list is a plan), so no
 * symbol takes two slots or inherits another's place.
 */
export function planQueue(input: QueueInput): QueuePlan {
  const capacity = nonNeg(input.capacity ?? QUEUE_CAPACITY);
  const shares = input.shares ?? DEFAULT_SHARES;
  const pools: Record<Exclude<QueueTier, "rotating">, QueueCandidate[]> = { core: [], plans: [], discovery: [], focus: [], watched: [] };
  const owner = new Set<string>();
  for (const tier of TIER_ORDER) {
    let rank = 0;
    for (const raw of input[tier]) {
      const symbol = clean(raw);
      rank += 1;
      if (!symbol || owner.has(symbol)) continue;
      owner.add(symbol);
      pools[tier].push({ symbol, tierRank: rank });
    }
  }

  const selected: QueueEntry[] = [];
  const taken = new Set<string>();
  const take = (c: QueueCandidate, sourceTier: Exclude<QueueTier, "rotating">, tier: QueueTier) => {
    if (selected.length >= capacity || taken.has(c.symbol)) return false;
    taken.add(c.symbol);
    selected.push({ symbol: c.symbol, tier, sourceTier, tierRank: c.tierRank });
    return true;
  };

  // 1. Each tier's reserved share, in tier order.
  // Core is always read whole: it is the scan's fixed footing, not a candidate.
  for (const tier of TIER_ORDER) {
    const quota = tier === "core" ? pools.core.length : nonNeg(shares[tier]);
    for (const c of pools[tier].slice(0, quota)) take(c, tier, tier);
  }

  // 2. Standing setups and watched names beyond their share claim the free
  //    slots first, in that order (review, 2026-10-28): a ready setup's
  //    entry notices and a member's watched alerts need a reading every scan,
  //    and a turn once every few hours misses them. Before the queue, setups
  //    and watchlists ranked ahead of the focus list; this keeps that order
  //    for the overflow while each tier still keeps its reserved share.
  //    The wheel keeps its own share whatever they claim, so a deferred name
  //    is still reached on a later scan.
  const claimable = Math.max(0, capacity - selected.length - nonNeg(shares.rotating));
  let claimed = 0;
  for (const tier of FIRST_CLAIM) {
    for (const c of pools[tier]) {
      if (claimed >= claimable) break;
      if (take(c, tier, tier)) claimed += 1;
    }
  }

  // 3. Every slot still left (the rotating share and any share a tier left
  //    unused) goes round the wheel: the rest of each tier in tier order, read
  //    from a clock-moved offset.
  const rest: { c: QueueCandidate; tier: Exclude<QueueTier, "rotating"> }[] = [];
  for (const tier of TIER_ORDER) for (const c of pools[tier]) if (!taken.has(c.symbol)) rest.push({ c, tier });
  const free = capacity - selected.length;
  if (free > 0 && rest.length > 0) {
    // Each tick moves the window by its own width, so consecutive ticks tile
    // the deferred names without a gap: every one is reached within
    // ceil(rest / free) ticks while the inputs hold.
    const offset = ((Math.floor(input.tick) * free) % rest.length + rest.length) % rest.length;
    for (let k = 0; k < rest.length && selected.length < capacity; k++) {
      const { c, tier } = rest[(offset + k) % rest.length];
      take(c, tier, "rotating");
    }
  }

  const deferred = rest
    .filter(({ c }) => !taken.has(c.symbol))
    .map(({ c, tier }) => ({ symbol: c.symbol, tier, sourceTier: tier, tierRank: c.tierRank, reason: "capacity" as const }));
  const byTier: Record<QueueTier, number> = { core: 0, plans: 0, discovery: 0, focus: 0, watched: 0, rotating: 0 };
  for (const e of selected) byTier[e.tier] += 1;
  return { selected, deferred, byTier, capacity, tick: input.tick };
}

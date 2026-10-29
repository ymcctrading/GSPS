/**
 * One vendor snapshot per symbol per poll interval, shared by every viewer on
 * this server instance (Q2 item 7, "Scale safely"; docs/CAPACITY_100_MEMBERS.md).
 *
 * `/api/quote` is polled by every open chart, header and order ticket every
 * 5 s (3 s for crypto, `lib/hooks/useLiveQuote.ts`), and each poll read a
 * fresh snapshot from the vendor. The free data plan allows 200 requests a
 * minute across the whole platform, scans included, so 17 members watching a
 * symbol at once spent all of it. Here a snapshot read in the last interval is
 * handed back, and a read in flight is joined rather than repeated, so N
 * viewers of one symbol cost one read per interval on an instance. The route's
 * CDN header does the same across instances. A failed read is never kept, so
 * the next poll tries again.
 *
 * Three-question basis: 1. Gann: none; infrastructure. 2. Cycles: the window
 * is the poll's own interval, an engineering figure. 3. Hermetic:
 * Correspondence, the same price whichever viewer asks. Law of Creation: a
 * mixture; nothing is created, reads are only shared.
 */

/** How long a snapshot is shared: the clients' own poll interval. */
export const SHARED_SNAPSHOT_MS = { us_equity: 5_000, crypto: 3_000 } as const;

type AssetClass = keyof typeof SHARED_SNAPSHOT_MS;

type Entry<T> = { at: number; value?: T; pending?: Promise<T> };

const entries = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 2_000;

/** Test seam. */
export function clearSharedSnapshots() {
  entries.clear();
}

export async function sharedSnapshot<T>(
  symbol: string,
  assetClass: AssetClass,
  read: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  const key = `${assetClass}:${symbol.toUpperCase()}`;
  const ttl = SHARED_SNAPSHOT_MS[assetClass];
  const hit = entries.get(key) as Entry<T> | undefined;
  if (hit?.pending) return hit.pending;
  if (hit && "value" in hit && now() - hit.at < ttl) return hit.value as T;

  if (entries.size >= MAX_ENTRIES) {
    const cutoff = now() - Math.max(SHARED_SNAPSHOT_MS.us_equity, SHARED_SNAPSHOT_MS.crypto);
    for (const [k, e] of entries) if (!e.pending && e.at < cutoff) entries.delete(k);
  }

  const pending = read().then(
    (value) => {
      entries.set(key, { at: now(), value });
      return value;
    },
    (err) => {
      entries.delete(key);
      throw err;
    },
  );
  entries.set(key, { at: now(), pending });
  return pending;
}

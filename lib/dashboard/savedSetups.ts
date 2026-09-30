/**
 * The signed-in user's saved setups, each joined to how it reads now.
 *
 * Read by the saved-setups page and by the Dashboard's "Saved setups" dropdown
 * (project owner, 2026-09-30), so both list exactly the same thing — this was
 * inline in `app/(app)/dashboard/saved/page.tsx` until the Dashboard needed it
 * too.
 *
 * A saved setup is a snapshot: its own `score`/`output_state` are frozen at
 * save time. Two things say how it has moved since:
 *
 *  - Today's scan re-ranks everything, so the same symbol + direction may have
 *    changed score, dropped out, or flipped direction — looked up by symbol +
 *    direction rather than assumed to still be there.
 *  - The Watch -> Execute monitor pipeline (lib/entitlements/monitor.ts)
 *    already evaluates every symbol it tracks and can catch a setup breaking
 *    (INVALIDATED) well before the next time a page happens to load.
 *    `active_monitors` has no `direction` column (at most one open monitor per
 *    symbol), so it is keyed by symbol alone; ordering by `last_evaluated_at
 *    desc` and keeping the first hit per symbol picks up the most recently
 *    evaluated monitor row. `evaluateMonitor` re-arms a terminal
 *    (INVALIDATED/EXPIRED/NO_SETUP) row in place on requalification rather than
 *    orphaning a new one, so in steady state there is exactly one row per
 *    symbol and this is mostly a defensive tiebreak.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedSetupRow } from "@/components/dashboard/saved-setups-list";
import type { ScanRow } from "@/components/scan/results-table";

type SavedSetupJoinRow = Omit<SavedSetupRow, "folderName" | "currentScore" | "currentOutputState" | "monitorState"> & {
  setup_folders: { name: string } | null;
};

export async function getSavedSetupRows(
  supabase: SupabaseClient,
  /** Passed as a promise so the scan read and the saved-setups read run side by side. */
  scansPromise: Promise<{ bullish: ScanRow[]; bearish: ScanRow[] }>,
): Promise<SavedSetupRow[]> {
  const [{ data }, scans] = await Promise.all([
    supabase.from("saved_setups").select("*, setup_folders(name)").order("saved_at", { ascending: false }),
    scansPromise,
  ]);

  const savedRows = (data ?? []) as SavedSetupJoinRow[];
  if (savedRows.length === 0) return [];

  const currentBySymbolDirection = new Map(
    [...scans.bullish, ...scans.bearish].map((r) => [`${r.symbol}-${r.direction}`, r]),
  );

  const symbols = [...new Set(savedRows.map((r) => r.symbol))];
  const monitorStateBySymbol = new Map<string, string>();
  const { data: monitors } = await supabase
    .from("active_monitors")
    .select("symbol, state, last_evaluated_at")
    .in("symbol", symbols)
    .order("last_evaluated_at", { ascending: false });
  for (const m of (monitors ?? []) as { symbol: string; state: string }[]) {
    if (!monitorStateBySymbol.has(m.symbol)) monitorStateBySymbol.set(m.symbol, m.state);
  }

  return savedRows.map((r) => {
    const current = currentBySymbolDirection.get(`${r.symbol}-${r.direction}`);
    return {
      id: r.id,
      symbol: r.symbol,
      direction: r.direction,
      score: r.score,
      output_state: r.output_state,
      entry: r.entry,
      stop_loss: r.stop_loss,
      take_profit1: r.take_profit1,
      master_profit: r.master_profit,
      pattern_name: r.pattern_name,
      setup_kind: r.setup_kind,
      saved_at: r.saved_at,
      folderName: r.setup_folders?.name ?? "Saved setups",
      currentScore: current?.score ?? null,
      currentOutputState: current?.outputState ?? null,
      monitorState: monitorStateBySymbol.get(r.symbol) ?? null,
    };
  });
}

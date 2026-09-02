import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SavedSetupsList, type SavedSetupRow } from "@/components/dashboard/saved-setups-list";
import { createClient } from "@/lib/supabase/server";
import { getDailyScans } from "@/lib/dailyScans";

export const metadata = { title: "Saved setups — GSPS" };
export const dynamic = "force-dynamic";

export default async function SavedSetupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let rows: SavedSetupRow[] = [];
  if (user) {
    const [{ data }, { bullish, bearish }] = await Promise.all([
      supabase
        .from("saved_setups")
        .select("*, setup_folders(name)")
        .order("saved_at", { ascending: false }),
      getDailyScans(),
    ]);

    // Today's scan re-ranks everything, so a saved setup's symbol may have
    // moved, dropped out, or flipped direction since it was saved — look it
    // up by symbol + direction rather than assuming it's still there.
    const currentBySymbolDirection = new Map(
      [...bullish, ...bearish].map((r) => [`${r.symbol}-${r.direction}`, r]),
    );

    type SavedSetupJoinRow = Omit<
      SavedSetupRow,
      "folderName" | "currentScore" | "currentOutputState" | "monitorState"
    > & {
      setup_folders: { name: string } | null;
    };
    const savedRows = (data ?? []) as SavedSetupJoinRow[];

    // The Watch -> Execute monitor pipeline (lib/entitlements/monitor.ts)
    // already evaluates every symbol it has tracked against the latest scan
    // and can catch a setup breaking (INVALIDATED) well before the next time
    // this page happens to load — a saved setup's own `score`/`output_state`
    // is frozen at save time and never knows this happened. `active_monitors`
    // has no `direction` column (at most one open monitor per symbol), so
    // this is keyed by symbol alone; ordering by `last_evaluated_at desc`
    // and keeping the first hit per symbol picks up whichever monitor row —
    // open or since-invalidated — was evaluated most recently.
    const symbols = [...new Set(savedRows.map((r) => r.symbol))];
    const monitorStateBySymbol = new Map<string, string>();
    if (symbols.length > 0) {
      const { data: monitors } = await supabase
        .from("active_monitors")
        .select("symbol, state, last_evaluated_at")
        .in("symbol", symbols)
        .order("last_evaluated_at", { ascending: false });
      for (const m of (monitors ?? []) as { symbol: string; state: string }[]) {
        if (!monitorStateBySymbol.has(m.symbol)) monitorStateBySymbol.set(m.symbol, m.state);
      }
    }

    rows = savedRows.map((r) => {
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

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
        <h1 className="text-xl font-semibold sm:text-2xl">Saved setups</h1>
        <p className="text-sm text-muted">
          Buy and sell setups you bookmarked from the dashboard, kept here for easy reference.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your folders</CardTitle>
          <CardDescription>A saved setup keeps the trade plan as it looked when you saved it.</CardDescription>
        </CardHeader>
        <CardContent>
          <SavedSetupsList initialRows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SavedSetupsList, type SavedSetupRow } from "@/components/dashboard/saved-setups-list";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Saved setups — GSPS" };
export const dynamic = "force-dynamic";

export default async function SavedSetupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let rows: SavedSetupRow[] = [];
  if (user) {
    const { data } = await supabase
      .from("saved_setups")
      .select("*, setup_folders(name)")
      .order("saved_at", { ascending: false });

    type SavedSetupJoinRow = Omit<SavedSetupRow, "folderName"> & { setup_folders: { name: string } | null };
    rows = ((data ?? []) as SavedSetupJoinRow[]).map((r) => ({
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
    }));
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

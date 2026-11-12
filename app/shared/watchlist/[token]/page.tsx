import { SharedListView } from "@/components/watchlist/shared-list-view";

export const metadata = {
  title: "Shared watchlist — GSPS",
  description: "A watchlist a GSPS member shared with you.",
  // A shared link is for the people it was sent to, not for search engines.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** A member's shared watchlist (Q3 plan item 7; lib/watchlist/share.ts). */
export default async function SharedWatchlistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 px-4 py-10">
      <SharedListView token={token} />
    </main>
  );
}

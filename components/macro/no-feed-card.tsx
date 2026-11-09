import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * What a macro card shows while no live feed is connected. The routes still
 * answer with a generated demo calendar (`simulated: true`); a member is not
 * shown it, because a generated date reads as a real one however it is
 * labelled ("only the real", numbers audit 2026-11-09). The card stays, so
 * connecting a feed brings it back with no layout change.
 */
export function NoFeedCard({ title, what }: { title: string; what: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>No live feed is connected yet.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted">
        GSPS shows {what} only from a live source, and none is connected yet, so nothing is listed here. Check
        release dates with your broker or the company before trading around them.
      </CardContent>
    </Card>
  );
}

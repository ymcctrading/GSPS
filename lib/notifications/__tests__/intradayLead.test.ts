import { describe, expect, it } from "vitest";
import type { Alert } from "@/lib/scanner/intraday";
import { dueForLead, signalHashFor } from "@/lib/notifications/intradayDelivery";

const alert = (over: Partial<Alert>): Alert =>
  ({ symbol: "LLY", type: "old_level_cross", direction: "up", confidence: 70, ...over }) as unknown as Alert;
const approach = (etaMinutes: number) =>
  alert({ type: "entry_approach", approach: { entry: 501, distance: 3, ratePerBar: 0.1, etaMinutes, expectedAt: "" } });

describe("dueForLead", () => {
  it("sends a heads-up once the time left is within the member's lead plus one scan, and every other signal as before", () => {
    const alerts = [approach(25), approach(50), alert({})];
    expect(dueForLead(alerts, 15).map((a) => a.approach?.etaMinutes ?? null)).toEqual([25, null]);
    expect(dueForLead(alerts, 60)).toHaveLength(3);
    expect(dueForLead([alert({ type: "entry_approach" })], 60)).toHaveLength(0);
  });
});

describe("signalHashFor", () => {
  it("keys every signal and notice on its own type and direction, never the score", () => {
    expect(signalHashFor(approach(10))).toBe("LLY-entry_approach-bullish");
    expect(signalHashFor(alert({ type: "entry_reached", direction: "down" }))).toBe("LLY-entry_reached-bearish");
    expect(signalHashFor(alert({}))).toBe(`LLY-${alert({}).type}-bullish`);
  });
});

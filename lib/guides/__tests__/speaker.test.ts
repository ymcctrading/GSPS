import { describe, it, expect } from "vitest";
import { speakerOf } from "@/lib/guides/speaker";

describe("speakerOf", () => {
  it("reads the guide a line opens with", () => {
    expect(speakerOf("Mr. Bull's rule: the chart is the record.")).toBe("bull");
    expect(speakerOf("Mrs. Bear's warning: headlines come after the move.")).toBe("bear");
    expect(speakerOf("Mr. Bull and Mrs. Bear are your guides.")).toBe("both");
    expect(speakerOf("  Mr. Bull likes to measure.")).toBe("bull");
  });

  it("leaves a line that only mentions a guide later to the lesson", () => {
    expect(speakerOf("His third entry is a low that has stopped falling.")).toBeNull();
    expect(speakerOf("A market that rallies, as Mrs. Bear warns, can fail.")).toBeNull();
  });
});

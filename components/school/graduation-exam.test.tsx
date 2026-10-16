/**
 * The exam's chart draws the older levels the key may rest on (PLAN.md item 5,
 * step 3 review R6), so a student is graded only on what the chart shows.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExamChart } from "@/components/school/graduation-exam";

const bars = Array.from({ length: 30 }, (_, i) => {
  const c = 110 + i * 0.5;
  return { t: `2026-03-${String(i + 1).padStart(2, "0")}`, o: c, h: c + 0.5, l: c - 0.5, c };
});

describe("ExamChart", () => {
  it("draws a labelled line for each level, inside the chart even when the bars never reach it", () => {
    const { container } = render(<ExamChart bars={bars} levels={[{ price: 100, label: "2025 top" }, { price: 150, label: "Record high" }]} />);
    expect(screen.getByText("2025 top")).toBeInTheDocument();
    expect(screen.getByText("Record high")).toBeInTheDocument();
    const lines = container.querySelectorAll("line[data-level]");
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      const y = Number(l.getAttribute("y1"));
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(200);
    }
  });

  it("draws no level lines when there are none", () => {
    const { container } = render(<ExamChart bars={bars} />);
    expect(container.querySelectorAll("line[data-level]")).toHaveLength(0);
  });
});

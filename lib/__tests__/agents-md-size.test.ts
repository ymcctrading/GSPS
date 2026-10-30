import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// AGENTS.md is loaded into every Claude session on every request. It grew to
// 305 KB of dated history (about 75K tokens a request) before the 2026-10-30
// split moved the history to docs/agents/. This keeps it from growing back:
// new history goes in the topic file there (AGENTS.md, "How this file works").
const LIMIT_BYTES = 48 * 1024;

describe("AGENTS.md", () => {
  it("stays a lean index of standing rules", () => {
    const bytes = readFileSync(path.resolve(__dirname, "../../AGENTS.md")).length;
    expect(bytes).toBeLessThanOrEqual(LIMIT_BYTES);
  });

  it("points only at docs/agents files that exist", () => {
    const text = readFileSync(path.resolve(__dirname, "../../AGENTS.md"), "utf8");
    const refs = new Set(text.match(/docs\/agents\/[\w./-]+\.md/g) ?? []);
    expect(refs.size).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(() => readFileSync(path.resolve(__dirname, "../..", ref))).not.toThrow();
    }
  });

  it("names every moved section's full-text file", () => {
    const text = readFileSync(path.resolve(__dirname, "../../AGENTS.md"), "utf8");
    const dir = path.resolve(__dirname, "../../docs/agents");
    const sections = readdirSync(dir).filter((f) => /^\d{2}-.+\.md$/.test(f));
    expect(sections.length).toBeGreaterThan(0);
    for (const f of sections) expect(text).toContain(`docs/agents/${f}`);
  });
});

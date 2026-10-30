import { describe, expect, it } from "vitest";
import { THEME_BAR_COLOR, THEME_SCRIPT, THEME_STORAGE_KEY, parseThemeChoice, resolveTheme } from "@/lib/theme";

/** Runs the head script against a stand-in document, storage and media query. */
function runScript(stored: string | null, deviceDark: boolean, throwsOnStorage = false) {
  const classes = new Set<string>();
  const meta = { content: "#fafafa", setAttribute(_: string, v: string) { this.content = v; } };
  const root = {
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
    style: { colorScheme: "" },
  };
  const document = {
    documentElement: root,
    querySelectorAll: () => [meta],
    addEventListener: () => undefined,
  };
  const localStorage = {
    getItem: (k: string) => {
      if (throwsOnStorage) throw new Error("blocked");
      return k === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const window = { matchMedia: () => ({ matches: deviceDark }) };
  new Function("document", "localStorage", "window", THEME_SCRIPT)(document, localStorage, window);
  return { dark: classes.has("dark"), colorScheme: root.style.colorScheme, bar: meta.content };
}

describe("theme choice", () => {
  it("defaults to light for anything unknown or missing", () => {
    expect(parseThemeChoice(null)).toBe("light");
    expect(parseThemeChoice("purple")).toBe("light");
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice("device")).toBe("device");
  });

  it("follows the device only when asked to", () => {
    expect(resolveTheme("device", true)).toBe("dark");
    expect(resolveTheme("device", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("THEME_SCRIPT, the head script that applies the theme before paint", () => {
  const cases: [string | null, boolean][] = [
    [null, false], [null, true], ["light", true], ["dark", false], ["device", true], ["device", false], ["junk", true],
  ];
  it.each(cases)("stored %s, device dark %s: matches resolveTheme", (stored, deviceDark) => {
    const want = resolveTheme(parseThemeChoice(stored), deviceDark);
    const got = runScript(stored, deviceDark);
    expect(got.dark).toBe(want === "dark");
    expect(got.colorScheme).toBe(want);
    expect(got.bar).toBe(THEME_BAR_COLOR[want]);
  });

  it("leaves the page light when storage can't be read", () => {
    expect(runScript(null, true, true).dark).toBe(false);
  });
});

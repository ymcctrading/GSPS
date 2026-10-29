import { describe, expect, it } from "vitest";
import { installState, isAppleMobile } from "@/lib/pwa/install";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";

describe("isAppleMobile", () => {
  it("reads an iPhone, and an iPad that reports a Mac user agent with touch", () => {
    expect(isAppleMobile(IPHONE, 5)).toBe(true);
    expect(isAppleMobile(IPAD_DESKTOP, 5)).toBe(true);
  });
  it("does not read a Mac without touch, or Android, as Apple mobile", () => {
    expect(isAppleMobile(IPAD_DESKTOP, 0)).toBe(false);
    expect(isAppleMobile(ANDROID, 5)).toBe(false);
  });
});

describe("installState", () => {
  it("has nothing to install once opened from the home screen", () => {
    expect(installState({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true, promptAvailable: false })).toEqual({ kind: "installed" });
    expect(installState({ userAgent: ANDROID, maxTouchPoints: 5, standalone: true, promptAvailable: true })).toEqual({ kind: "installed" });
  });
  it("gives the Home Screen steps on an iPhone in the browser, since push needs them", () => {
    expect(installState({ userAgent: IPHONE, maxTouchPoints: 5, standalone: false, promptAvailable: false })).toEqual({ kind: "ios_steps" });
  });
  it("offers the Install button where the browser holds a prompt", () => {
    expect(installState({ userAgent: ANDROID, maxTouchPoints: 5, standalone: false, promptAvailable: true })).toEqual({ kind: "prompt" });
  });
  it("points to the browser's menu where it holds none", () => {
    expect(installState({ userAgent: FIREFOX, maxTouchPoints: 0, standalone: false, promptAvailable: false })).toEqual({ kind: "browser_menu" });
  });
});

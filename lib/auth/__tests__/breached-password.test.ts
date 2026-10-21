import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  BREACHED_PASSWORD_MESSAGE,
  breachCountInRange,
  breachedPasswordError,
  sha1Hex,
} from "../breached-password";

const PASSWORD_HASH = createHash("sha1").update("password").digest("hex").toUpperCase();
const PASSWORD_SUFFIX = PASSWORD_HASH.slice(5);

describe("breached-password", () => {
  it("hashes to upper-case SHA-1 hex", async () => {
    expect(await sha1Hex("password")).toBe(PASSWORD_HASH);
    expect(PASSWORD_HASH.slice(0, 5)).toBe("5BAA6");
  });

  it("reads the count for a matching suffix and ignores padding rows", () => {
    const padding = "0".repeat(35);
    const body = `${padding}:0\r\n${PASSWORD_SUFFIX}:9659365\r\nFFFF:0`;
    expect(breachCountInRange(body, PASSWORD_SUFFIX)).toBe(9659365);
    expect(breachCountInRange(body, padding)).toBe(0);
    expect(breachCountInRange(body, "ABCDEF")).toBe(0);
  });

  it("sends only the five-character prefix and refuses a breached password", async () => {
    const fetchRange = vi.fn(async () => `${PASSWORD_SUFFIX}:3`);
    expect(await breachedPasswordError("password", fetchRange)).toBe(BREACHED_PASSWORD_MESSAGE);
    expect(fetchRange).toHaveBeenCalledWith("5BAA6");
  });

  it("allows a password not in the range", async () => {
    expect(await breachedPasswordError("password", async () => "ABC:1")).toBeNull();
  });

  it("fails open when the lookup is unavailable", async () => {
    expect(await breachedPasswordError("password", async () => null)).toBeNull();
    expect(
      await breachedPasswordError("password", async () => {
        throw new Error("network");
      }),
    ).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSharedSnapshots, sharedSnapshot, SHARED_SNAPSHOT_MS } from "../sharedSnapshot";

afterEach(() => clearSharedSnapshots());

describe("sharedSnapshot", () => {
  it("shares one read across viewers within the poll interval", async () => {
    let t = 1_000;
    const now = () => t;
    const read = vi.fn(async () => ({ price: 100 }));
    await sharedSnapshot("aapl", "us_equity", read, now);
    t += SHARED_SNAPSHOT_MS.us_equity - 1;
    await sharedSnapshot("AAPL", "us_equity", read, now);
    expect(read).toHaveBeenCalledTimes(1);
    t += 1;
    await sharedSnapshot("AAPL", "us_equity", read, now);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("joins a read in flight instead of repeating it", async () => {
    let resolve!: (v: number) => void;
    const read = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const a = sharedSnapshot("BTC/USD", "crypto", read);
    const b = sharedSnapshot("BTC/USD", "crypto", read);
    resolve(7);
    expect(await a).toBe(7);
    expect(await b).toBe(7);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("keys by asset class and symbol", async () => {
    const read = vi.fn(async () => 1);
    await sharedSnapshot("AAPL", "us_equity", read);
    await sharedSnapshot("MSFT", "us_equity", read);
    await sharedSnapshot("AAPL", "crypto", read);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("never keeps a failed read", async () => {
    const read = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("429"))
      .mockResolvedValueOnce(5);
    await expect(sharedSnapshot("AAPL", "us_equity", read)).rejects.toThrow("429");
    expect(await sharedSnapshot("AAPL", "us_equity", read)).toBe(5);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

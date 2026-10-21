import { vi } from "vitest";

// The order lease (lib/trade/order-lock.ts) is a database round trip the
// order-path tests' stub clients don't model. Every lib test runs the order
// straight through; lib/trade/__tests__/order-lock.test.ts unmocks it to test
// the lease itself.
vi.mock("@/lib/trade/order-lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/trade/order-lock")>();
  return { ...actual, withOrderLock: <T>(_s: unknown, _u: string, place: () => Promise<T>) => place() };
});

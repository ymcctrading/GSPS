/**
 * Setup for the `ui` project (see vitest.config.ts).
 *
 * `globals` is off — tests import `describe`/`it`/`expect` explicitly, which
 * is what the existing lib tests already do — so React Testing Library's
 * automatic cleanup doesn't wire itself up and we register it here. Without
 * it, each rendered tree stays in the document and the next test's queries
 * find two of everything.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

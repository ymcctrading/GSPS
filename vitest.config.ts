import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname) };

/**
 * Two projects, because the two kinds of test want different environments.
 *
 * `lib` is pure logic and runs in Node — no DOM to build up and tear down per
 * file, so it stays fast. `ui` renders components through React Testing
 * Library and needs jsdom plus the jest-dom matchers.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "lib",
          include: ["lib/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "ui",
          include: ["{app,components}/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});

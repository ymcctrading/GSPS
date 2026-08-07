import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Every data-bearing component now stores a fetch against the symbol it
    // answers and drops it at render time when the two disagree, so the rule
    // is a hard error everywhere: a new violation means a component can render
    // one ticker's data under another's name, which is how wrong trade levels
    // reach the screen.
    //
    // candles.tsx is the exception. Its two sites are chart-internal — kicking
    // off a bar load, and clearing drawings/alerts when the symbol changes —
    // not stale fetched data, and untangling them means restructuring the
    // chart's imperative lifecycle around lightweight-charts with no UI tests
    // to catch a regression. Left visible rather than silenced.
    files: ["components/chart/candles.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase edge functions run on Deno, not Node: different globals, URL
    // imports, its own toolchain. Checking them against the Next.js config
    // reports failures that mean nothing about how they actually run.
    // tsconfig.json excludes the same directory.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;

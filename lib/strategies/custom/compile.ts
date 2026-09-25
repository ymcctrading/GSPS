/**
 * Single entry point: DSL source text + a script's identity -> a compiled
 * evaluator, or a list of validation errors. Callers (Phase 2's CRUD API,
 * Phase 3's chart hook, Phase 4's backtester) should use this rather than
 * calling `parseScript`/`interpret` directly, so every compiled script goes
 * through the same bounds and error handling.
 */

import { ParseError, parseScript } from "./parser";
import { interpret, type ScriptIdentity } from "./interpret";
import type { CompiledScriptEvaluator, CustomScriptAst } from "./types";

export interface CompileResult {
  ok: boolean;
  evaluator: CompiledScriptEvaluator | null;
  ast: CustomScriptAst | null;
  errors: string[];
}

export function compileCustomScript(source: string, identity: ScriptIdentity): CompileResult {
  try {
    const ast = parseScript(source);
    const evaluator = interpret(ast, identity);
    return { ok: true, evaluator, ast, errors: [] };
  } catch (err) {
    if (err instanceof ParseError) {
      return { ok: false, evaluator: null, ast: null, errors: [err.message] };
    }
    throw err;
  }
}

/**
 * Recursive-descent parser for the custom-script DSL: text -> `CustomScriptAst`
 * (`types.ts`). This is the only place source text is interpreted, and it
 * does nothing but build data — every production below emits exactly one of
 * the node kinds `types.ts` declares, there is no fallthrough to "evaluate
 * this piece now" or any dynamic identifier/property lookup outside the
 * whitelists in `INDICATOR_SPECS`/`BAR_SERIES_NAMES` below. An unrecognized
 * identifier, an out-of-range parameter, an oversized tree, or a second
 * `bullish`/`bearish` block is a parse error, not a best-effort guess.
 *
 * Grammar (informal EBNF):
 *
 *   script    := ruleBlock*
 *   ruleBlock := 'rule' direction 'when' boolExpr '{' statement* '}'
 *   direction := 'bullish' | 'bearish'
 *   statement := ('entry'|'stop'|'tp1r'|'mtpr') '=' numExpr
 *
 *   boolExpr  := orExpr
 *   orExpr    := andExpr ('or' andExpr)*
 *   andExpr   := notExpr ('and' notExpr)*
 *   notExpr   := 'not' notExpr | boolPrimary
 *   boolPrimary := '(' boolExpr ')'
 *                | 'crossesAbove' '(' numExpr ',' numExpr ')'
 *                | 'crossesBelow' '(' numExpr ',' numExpr ')'
 *                | numExpr compareOp numExpr
 *   compareOp := '>' | '<' | '>=' | '<=' | '==' | '!='
 *
 *   numExpr   := addExpr
 *   addExpr   := mulExpr (('+'|'-') mulExpr)*
 *   mulExpr   := unaryExpr (('*'|'/') unaryExpr)*
 *   unaryExpr := '-' unaryExpr | primary
 *   primary   := NUMBER
 *              | '(' numExpr ')'
 *              | barSeries ('[' NUMBER ']')?
 *              | 'lowest' '(' ('low'|'high') ',' NUMBER ')' ('[' NUMBER ']')?
 *              | 'highest' '(' ('low'|'high') ',' NUMBER ')' ('[' NUMBER ']')?
 *              | indicatorName '(' (NUMBER (',' NUMBER)*)? ')' ('.' field)? ('[' NUMBER ']')?
 */

import { tokenize, type Token, type TokenKind } from "./lexer";
import {
  MAX_AST_NODES,
  MAX_EXPR_DEPTH,
  MAX_PERIOD_OR_OFFSET,
  MAX_SOURCE_LENGTH,
  MIN_PERIOD,
} from "./limits";
import type {
  BarSeriesName,
  BoolExpr,
  CompareOp,
  CustomScriptAst,
  CustomScriptRule,
  IndicatorFn,
  NumExpr,
} from "./types";
import type { StrategyDirection } from "../types";

export class ParseError extends Error {}

const BAR_SERIES_NAMES: readonly BarSeriesName[] = ["open", "high", "low", "close", "volume"];

interface ParamSpec {
  min: number;
  max: number;
  integer: boolean;
}

interface IndicatorSpec {
  fn: IndicatorFn;
  /** Parameter specs in order. A trailing run may be omitted by the author
   * if `defaults` supplies a value for it. */
  params: ParamSpec[];
  defaults: number[];
  /** `null` = the function has one numeric output and no `.field` is
   * allowed. Otherwise the set of field names `.field` may select. */
  fields: readonly string[] | null;
}

const PERIOD: ParamSpec = { min: MIN_PERIOD, max: MAX_PERIOD_OR_OFFSET, integer: true };
const SMOOTHING_FACTOR: ParamSpec = { min: 0.0001, max: 1, integer: false };
const MULTIPLIER: ParamSpec = { min: 0.01, max: 50, integer: false };

const INDICATOR_SPECS: Record<string, IndicatorSpec> = {
  sma: { fn: "sma", params: [PERIOD], defaults: [], fields: null },
  ema: { fn: "ema", params: [PERIOD], defaults: [], fields: null },
  rsi: { fn: "rsi", params: [PERIOD], defaults: [14], fields: null },
  atr: { fn: "atr", params: [PERIOD], defaults: [14], fields: null },
  vwap: { fn: "vwap", params: [], defaults: [], fields: null },
  macd: {
    fn: "macd",
    params: [PERIOD, PERIOD, PERIOD],
    defaults: [12, 26, 9],
    fields: ["macd", "signal", "histogram"],
  },
  bollinger: {
    fn: "bollinger",
    params: [PERIOD, MULTIPLIER],
    defaults: [20, 2],
    fields: ["upper", "middle", "lower"],
  },
  psar: {
    fn: "psar",
    params: [SMOOTHING_FACTOR, SMOOTHING_FACTOR],
    defaults: [0.02, 0.2],
    fields: ["value"],
  },
  supertrend: {
    fn: "supertrend",
    params: [PERIOD, MULTIPLIER],
    defaults: [10, 3],
    fields: ["value"],
  },
  stochastic: {
    fn: "stochastic",
    params: [PERIOD, PERIOD, PERIOD],
    defaults: [14, 3, 3],
    fields: ["k", "d"],
  },
};

export const INDICATOR_NAMES: readonly string[] = Object.keys(INDICATOR_SPECS);

class Parser {
  private tokens: Token[];
  private idx = 0;
  private nodeCount = 0;
  private depth = 0;

  constructor(source: string) {
    if (source.length > MAX_SOURCE_LENGTH) {
      throw new ParseError(`Script exceeds ${MAX_SOURCE_LENGTH} characters`);
    }
    this.tokens = tokenize(source);
  }

  private peek(): Token {
    return this.tokens[this.idx];
  }

  private at(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private atKeyword(word: string): boolean {
    const t = this.peek();
    return t.kind === "ident" && t.text === word;
  }

  private advance(): Token {
    const t = this.tokens[this.idx];
    if (t.kind !== "eof") this.idx++;
    return t;
  }

  private expect(kind: TokenKind, what: string): Token {
    if (!this.at(kind)) {
      throw new ParseError(`Expected ${what} at position ${this.peek().pos}, got '${this.peek().text || "end of script"}'`);
    }
    return this.advance();
  }

  private node<T>(build: () => T): T {
    this.nodeCount++;
    if (this.nodeCount > MAX_AST_NODES) {
      throw new ParseError(`Script exceeds ${MAX_AST_NODES} expression nodes`);
    }
    return build();
  }

  private withDepth<T>(build: () => T): T {
    this.depth++;
    if (this.depth > MAX_EXPR_DEPTH) {
      throw new ParseError(`Script exceeds maximum expression nesting depth (${MAX_EXPR_DEPTH})`);
    }
    try {
      return build();
    } finally {
      this.depth--;
    }
  }

  private numberLiteral(what: string): number {
    const t = this.expect("number", what);
    return t.value as number;
  }

  private boundedNumber(spec: ParamSpec, what: string): number {
    const value = this.numberLiteral(what);
    if (spec.integer && !Number.isInteger(value)) {
      throw new ParseError(`${what} must be a whole number, got ${value}`);
    }
    if (value < spec.min || value > spec.max) {
      throw new ParseError(`${what} must be between ${spec.min} and ${spec.max}, got ${value}`);
    }
    return value;
  }

  private offsetSuffix(): number {
    if (!this.at("[")) return 0;
    this.advance();
    const offset = this.boundedNumber({ min: 0, max: MAX_PERIOD_OR_OFFSET, integer: true }, "offset");
    this.expect("]", "']'");
    return offset;
  }

  // ---- numeric expressions -------------------------------------------------

  private parseNumExpr(): NumExpr {
    return this.withDepth(() => this.parseAdd());
  }

  private parseAdd(): NumExpr {
    let left = this.parseMul();
    while (this.at("+") || this.at("-")) {
      const op = this.advance().kind as "+" | "-";
      const right = this.parseMul();
      left = this.node(() => ({ kind: "binary", op, left, right }) as NumExpr);
    }
    return left;
  }

  private parseMul(): NumExpr {
    let left = this.parseUnary();
    while (this.at("*") || this.at("/")) {
      const op = this.advance().kind as "*" | "/";
      const right = this.parseUnary();
      left = this.node(() => ({ kind: "binary", op, left, right }) as NumExpr);
    }
    return left;
  }

  private parseUnary(): NumExpr {
    if (this.at("-")) {
      this.advance();
      const expr = this.withDepth(() => this.parseUnary());
      return this.node(() => ({ kind: "neg", expr }) as NumExpr);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): NumExpr {
    if (this.at("number")) {
      const value = this.advance().value as number;
      return this.node(() => ({ kind: "num", value }) as NumExpr);
    }

    if (this.at("(")) {
      this.advance();
      const expr = this.withDepth(() => this.parseNumExpr());
      this.expect(")", "')'");
      return expr;
    }

    if (this.at("ident")) {
      const name = this.peek().text;

      if ((BAR_SERIES_NAMES as readonly string[]).includes(name)) {
        this.advance();
        const offset = this.offsetSuffix();
        return this.node(() => ({ kind: "series", series: name as BarSeriesName, offset }) as NumExpr);
      }

      if (name === "lowest" || name === "highest") {
        this.advance();
        this.expect("(", "'('");
        const seriesTok = this.expect("ident", "'low' or 'high'");
        const wanted = name === "lowest" ? "low" : "high";
        if (seriesTok.text !== wanted) {
          throw new ParseError(`'${name}' takes '${wanted}' as its series argument, got '${seriesTok.text}'`);
        }
        this.expect(",", "','");
        const lookback = this.boundedNumber(PERIOD, `${name}'s lookback`);
        this.expect(")", "')'");
        const offset = this.offsetSuffix();
        return this.node(
          () => ({ kind: "extreme", fn: name, series: wanted, lookback, offset }) as NumExpr,
        );
      }

      if (name in INDICATOR_SPECS) {
        this.advance();
        const spec = INDICATOR_SPECS[name];
        const params = this.parseIndicatorArgs(name, spec);
        let field: string | null = null;
        if (this.at(".")) {
          this.advance();
          const fieldTok = this.expect("ident", "field name");
          if (!spec.fields || !spec.fields.includes(fieldTok.text)) {
            const allowed = spec.fields ? spec.fields.join(", ") : "(none)";
            throw new ParseError(`'${name}' has no field '${fieldTok.text}'; allowed: ${allowed}`);
          }
          field = fieldTok.text;
        } else if (spec.fields) {
          throw new ParseError(`'${name}' requires a field, e.g. '${name}(...).${spec.fields[0]}'`);
        }
        const offset = this.offsetSuffix();
        return this.node(
          () => ({ kind: "indicator", fn: spec.fn, params, field, offset }) as NumExpr,
        );
      }

      throw new ParseError(`Unknown identifier '${name}' at position ${this.peek().pos}`);
    }

    throw new ParseError(`Expected a number, identifier, or '(' at position ${this.peek().pos}, got '${this.peek().text || "end of script"}'`);
  }

  private parseIndicatorArgs(name: string, spec: IndicatorSpec): number[] {
    this.expect("(", "'('");
    const given: number[] = [];
    if (!this.at(")")) {
      given.push(this.boundedNumber(spec.params[0], `${name}'s parameter 1`));
      while (this.at(",")) {
        this.advance();
        const i = given.length;
        if (i >= spec.params.length) {
          throw new ParseError(`'${name}' takes at most ${spec.params.length} parameter(s)`);
        }
        given.push(this.boundedNumber(spec.params[i], `${name}'s parameter ${i + 1}`));
      }
    }
    this.expect(")", "')'");

    const minRequired = spec.params.length - spec.defaults.length;
    if (given.length < minRequired || given.length > spec.params.length) {
      throw new ParseError(
        `'${name}' takes ${minRequired === spec.params.length ? spec.params.length : `${minRequired}-${spec.params.length}`} parameter(s), got ${given.length}`,
      );
    }
    const full = [...given];
    while (full.length < spec.params.length) {
      full.push(spec.defaults[full.length - minRequired]);
    }
    return full;
  }

  // ---- boolean (condition) expressions ------------------------------------

  private parseBoolExpr(): BoolExpr {
    return this.withDepth(() => this.parseOr());
  }

  private parseOr(): BoolExpr {
    let left = this.parseAnd();
    while (this.atKeyword("or")) {
      this.advance();
      const right = this.parseAnd();
      left = this.node(() => ({ kind: "or", left, right }) as BoolExpr);
    }
    return left;
  }

  private parseAnd(): BoolExpr {
    let left = this.parseNot();
    while (this.atKeyword("and")) {
      this.advance();
      const right = this.parseNot();
      left = this.node(() => ({ kind: "and", left, right }) as BoolExpr);
    }
    return left;
  }

  private parseNot(): BoolExpr {
    if (this.atKeyword("not")) {
      this.advance();
      const expr = this.withDepth(() => this.parseNot());
      return this.node(() => ({ kind: "not", expr }) as BoolExpr);
    }
    return this.parseBoolPrimary();
  }

  private parseBoolPrimary(): BoolExpr {
    if (this.at("(")) {
      this.advance();
      const expr = this.withDepth(() => this.parseBoolExpr());
      this.expect(")", "')'");
      return expr;
    }

    if (this.atKeyword("crossesAbove") || this.atKeyword("crossesBelow")) {
      const direction = this.advance().text === "crossesAbove" ? "above" : "below";
      this.expect("(", "'('");
      const a = this.parseNumExpr();
      this.expect(",", "','");
      const b = this.parseNumExpr();
      this.expect(")", "')'");
      return this.node(() => ({ kind: "cross", direction, a, b }) as BoolExpr);
    }

    const left = this.parseNumExpr();
    const opToken = this.peek();
    const compareOps: readonly TokenKind[] = [">", "<", ">=", "<=", "==", "!="];
    if (!compareOps.includes(opToken.kind)) {
      throw new ParseError(`Expected a comparison operator at position ${opToken.pos}, got '${opToken.text || "end of script"}'`);
    }
    this.advance();
    const right = this.parseNumExpr();
    return this.node(() => ({ kind: "compare", op: opToken.kind as CompareOp, left, right }) as BoolExpr);
  }

  // ---- rules / script ------------------------------------------------------

  private parseDirection(): StrategyDirection {
    if (this.atKeyword("bullish")) {
      this.advance();
      return "bullish";
    }
    if (this.atKeyword("bearish")) {
      this.advance();
      return "bearish";
    }
    throw new ParseError(`Expected 'bullish' or 'bearish' at position ${this.peek().pos}`);
  }

  private parseRuleBlock(): CustomScriptRule {
    if (!this.atKeyword("rule")) {
      throw new ParseError(`Expected 'rule' at position ${this.peek().pos}, got '${this.peek().text || "end of script"}'`);
    }
    this.advance();
    const direction = this.parseDirection();
    if (!this.atKeyword("when")) {
      throw new ParseError(`Expected 'when' at position ${this.peek().pos}`);
    }
    this.advance();
    const condition = this.parseBoolExpr();
    this.expect("{", "'{'");

    let entry: NumExpr | null = null;
    let stopLoss: NumExpr | null = null;
    let tp1R = 1.5;
    let mtpR = 3;

    while (!this.at("}")) {
      const key = this.expect("ident", "'entry', 'stop', 'tp1r', or 'mtpr'");
      this.expect("=", "'='");
      switch (key.text) {
        case "entry":
          entry = this.parseNumExpr();
          break;
        case "stop":
          stopLoss = this.parseNumExpr();
          break;
        case "tp1r":
          tp1R = this.boundedNumber({ min: 0.1, max: 20, integer: false }, "'tp1r'");
          break;
        case "mtpr":
          mtpR = this.boundedNumber({ min: 0.1, max: 20, integer: false }, "'mtpr'");
          break;
        default:
          throw new ParseError(`Unknown statement '${key.text}' at position ${key.pos}; expected 'entry', 'stop', 'tp1r', or 'mtpr'`);
      }
    }
    this.expect("}", "'}'");

    if (!entry) throw new ParseError(`Rule block for '${direction}' is missing 'entry = ...'`);
    if (!stopLoss) throw new ParseError(`Rule block for '${direction}' is missing 'stop = ...'`);
    if (mtpR <= tp1R) {
      throw new ParseError(`'mtpr' (${mtpR}) must be greater than 'tp1r' (${tp1R})`);
    }

    return { direction, condition, entry, stopLoss, tp1R, mtpR };
  }

  parseScript(): CustomScriptAst {
    let bullish: CustomScriptRule | null = null;
    let bearish: CustomScriptRule | null = null;

    while (!this.at("eof")) {
      const rule = this.parseRuleBlock();
      if (rule.direction === "bullish") {
        if (bullish) throw new ParseError("A script may declare at most one 'rule bullish' block");
        bullish = rule;
      } else {
        if (bearish) throw new ParseError("A script may declare at most one 'rule bearish' block");
        bearish = rule;
      }
    }

    if (!bullish && !bearish) {
      throw new ParseError("A script must declare at least one 'rule bullish' or 'rule bearish' block");
    }

    return { bullish, bearish };
  }
}

/** Parse DSL source text into a validated AST. Throws `ParseError` on any
 * syntax error, unknown identifier, out-of-range parameter, or a script that
 * exceeds `limits.ts`'s bounds. Never partially succeeds. */
export function parseScript(source: string): CustomScriptAst {
  return new Parser(source).parseScript();
}
